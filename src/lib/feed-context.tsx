import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/lib/auth-context';
import { fetchFeed, withLikeState, type LikeCounts, type Post } from '@/lib/posts';

/**
 * The cursor-paginated feed.
 *
 * It lives above the navigator so sharing a win can drop the created post
 * straight in — the server already returned it, and refetching the first page
 * to see something we are holding is a wasted round trip.
 *
 * The cursor and the end-of-feed flag are refs rather than state: they are read
 * inside the fetch, and as state they would either stale-close over an old
 * value or force `load` to be rebuilt on every page, which would in turn
 * re-fire the mount effect.
 */
type FeedValue = {
  posts: Post[];
  error: string | null;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  /** False once the server stops handing back a cursor. */
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  /** Put a just-created post at the top without going back to the server. */
  prepend: (post: Post) => void;
  /**
   * Posts the reader has deleted this session.
   *
   * Recorded here rather than only dropped from `posts`, for the same reason
   * `postState` exists: a post is drawn from whichever list it was fetched
   * into — the feed's, a circle's wall, a profile — and only the feed's list
   * lives here. Deleting from a circle wall would otherwise leave the card on
   * screen until a refresh. The card reads this set and stops drawing itself,
   * so one record covers every surface.
   */
  deletedPostIds: ReadonlySet<string>;
  removePost: (postId: string) => void;
  /** Put a post back after a delete the server refused. */
  restorePost: (postId: string) => void;
  /**
   * Posts as they stand after being edited, keyed by id.
   *
   * The counterpart to `deletedPostIds`, and there for the same reason: the
   * edited post has to replace the old one wherever it is being shown, not
   * only in the one list this context owns.
   */
  postEdits: Readonly<Record<string, Post>>;
  replacePost: (post: Post) => void;
  /**
   * Where the viewer stands with each author, as far as this session knows.
   *
   * A map rather than a set of the followed, because absent has to go on
   * meaning "nothing known". Not every endpoint reports `is_following`, so a
   * screen holding one of its own has to be able to tell a decision taken here
   * from a question never asked — and a set can only ever say one of the two.
   *
   * That is what a following badge reads, in front of whatever its own payload
   * said: an entry here is the later answer. Recording an unfollow by dropping
   * the id instead left the payload's stale `is_following: true` to win, so the
   * badge stayed on Following and the tap read as ignored.
   */
  followState: ReadonlyMap<string, boolean>;
  setFollowed: (userId: string, following: boolean) => void;
  /**
   * Take what the server has just said about a freshly fetched page of people.
   *
   * `setFollowed` records a decision taken here; this records the one the
   * server reports, and is how a map that has drifted is put right — a follow
   * taken on another device, or through a screen that did not say so, would
   * otherwise be outvoted forever by whatever this session last believed.
   *
   * Rows arriving without `is_following` say nothing about it and are left
   * exactly as they were, for the same reason the feed leaves them: absent is
   * not false. Only for a page just loaded, never a stale one — this overwrites
   * what the reader chose.
   */
  adoptFollowState: (people: readonly { id: string; is_following?: boolean }[]) => void;
  /**
   * Posts the viewer has saved.
   *
   * The server's answer, held here rather than read off each row, because the
   * same post is drawn from several lists — the feed, a circle's wall, the
   * shelf itself — and saving it in one has to fill in the bookmark in all of
   * them. Seeded by `adoptSavedState` from whatever a page reports, and moved
   * by `setSaved`.
   *
   * A set is enough where the follow state needs a map: every endpoint that
   * serves a post says `viewer_has_saved`, so absent means unsaved rather than
   * unknown.
   */
  savedPostIds: ReadonlySet<string>;
  /**
   * Record a save the reader has just made, before the server has answered.
   *
   * The request itself belongs to whoever called: the card knows how to put its
   * own bookmark back and say why, and this holds no toast of its own.
   */
  setSaved: (postId: string, saved: boolean) => void;
  /** Take the save state a freshly fetched page of posts reports. */
  adoptSavedState: (posts: readonly Post[]) => void;
  /**
   * Write a post's like state back into the row.
   *
   * Not a set alongside `savedPostIds`, because likes are not this session's
   * secret: every feed row carries `viewer_has_liked` and `likes_count`, so the
   * row already is the record and a parallel set would only be a second answer
   * to the same question. Takes the whole pair rather than a boolean so the
   * server's count can be applied verbatim — the viewer's own tap is not the
   * only thing that moves it.
   */
  applyLike: (postId: string, counts: LikeCounts) => void;
  /**
   * Move a post's comment total, so the card's counter keeps up with a
   * conversation happening on another screen.
   *
   * Two forms because the endpoints answer differently: creating hands back the
   * comment and says nothing about the total, so the client counts (`by`);
   * deleting hands back `comments_count`, which is the authority (`to`).
   */
  adjustComments: (postId: string, change: { by: number } | { to: number }) => void;
  /**
   * Which post has its comment box open, if any.
   *
   * Held here rather than on each card so that only one can be open at a time.
   * Two boxes at once put two autofocusing inputs on screen fighting over the
   * keyboard, and left the writer unsure which post they were replying to —
   * the cards scroll independently of the box that has focus.
   */
  /**
   * Counters as they stand after the reader has acted on a post, keyed by id.
   *
   * A post is drawn from whichever list it was fetched into — the feed's, a
   * circle's wall, its own screen — and only the feed's list lives here. Liking
   * a post on a circle's wall therefore moved nothing on screen: the card reads
   * its counts from the prop, and the prop came from a list this context never
   * touches. These overrides follow the post rather than the list, so a tap
   * lands wherever the post is being shown.
   */
  postState: Readonly<Record<string, PostInteraction>>;
  composingPostId: string | null;
  /** Opens one box and closes whatever was open. `null` closes them all. */
  setComposingPost: (postId: string | null) => void;
};

/** The counters a reader's own actions have moved. */
export type PostInteraction = {
  viewer_has_liked?: boolean;
  likes_count?: number;
  comments_count?: number;
};

const FeedContext = createContext<FeedValue | null>(null);

export function FeedProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();

  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [followState, setFollowState] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [savedPostIds, setSavedPostIds] = useState<ReadonlySet<string>>(() => new Set());
  const [composingPostId, setComposingPost] = useState<string | null>(null);
  const [postState, setPostState] = useState<Record<string, PostInteraction>>({});

  const patchPostState = useCallback((postId: string, patch: PostInteraction) => {
    setPostState((previous) => ({ ...previous, [postId]: { ...previous[postId], ...patch } }));
  }, []);

  const cursor = useRef<string | null>(null);
  const atEnd = useRef(false);
  const inFlight = useRef(false);
  /**
   * Set when a page fetch fails, and what stops the list from asking again on
   * its own.
   *
   * `onEndReached` is not a one-shot: the list re-fires it for every new content
   * length, and the footer spinner appearing and disappearing changes the
   * content length. So a failed page that leaves `atEnd` false spins — fetch,
   * fail, toggle the spinner, fetch — without anyone scrolling, which on the web
   * build is immediate because content that does not overflow is always within
   * the end threshold. Cleared by a refresh, the only retry that is a decision
   * rather than a side effect.
   */
  const failed = useRef(false);

  /**
   * Take the follow state the server just reported for a page of authors.
   *
   * `is_following` is optional, and an author who arrives without it is left
   * exactly as it was — an older server that does not send the field must not
   * silently unfollow everyone on screen.
   *
   * A reset — first load or pull-to-refresh — rebuilds the map from scratch, so
   * a follow undone elsewhere (another device, or a row deleted straight out of
   * the database) is picked up rather than remembered forever. Loading a further
   * page only adds to it, since those posts say nothing about authors already
   * seen.
   */
  const applyFollowState = useCallback((page: Post[], reset: boolean) => {
    setFollowState((previous) => {
      const next = reset ? new Map<string, boolean>() : new Map(previous);

      for (const { author } of page) {
        if (author.is_following === undefined) {
          // Unknown: keep whatever was already believed about them, and go on
          // believing nothing where there was nothing.
          const held = previous.get(author.id);
          if (held !== undefined) next.set(author.id, held);
          continue;
        }

        next.set(author.id, author.is_following);
      }

      return next;
    });
  }, []);

  /**
   * Take what a freshly fetched page says about its posts.
   *
   * Never a rebuild, always a merge: a page is one list's worth of posts, not
   * the whole shelf, so clearing what it does not mention would unsave
   * everything the reader saved from somewhere else.
   *
   * Declared above `load`, which lists it as a dependency — a `const` named in
   * a dependency array is read while rendering, so one declared further down
   * the file would be read before it exists.
   */
  const adoptSavedState = useCallback((posts: readonly Post[]) => {
    setSavedPostIds((previous) => {
      // Built only once something actually moves, so a page that agrees with
      // what is held does not re-render every card drawing from this.
      let next: Set<string> | null = null;

      for (const post of posts) {
        if (previous.has(post.id) === post.viewer_has_saved) continue;

        next ??= new Set(previous);
        if (post.viewer_has_saved) next.add(post.id);
        else next.delete(post.id);
      }

      return next ?? previous;
    });
  }, []);

  const load = useCallback(
    async (reset: boolean) => {
      if (!token || inFlight.current) return;
      if (!reset && (atEnd.current || failed.current)) return;

      inFlight.current = true;
      failed.current = false;
      setError(null);

      try {
        const page = await fetchFeed(token, reset ? undefined : (cursor.current ?? undefined));
        cursor.current = page.meta.next_cursor;
        atEnd.current = page.meta.next_cursor === null;
        setHasMore(!atEnd.current);
        // The server's own like state wins outright on a reset, which is what
        // makes a like survive a pull-to-refresh: the row carries
        // `viewer_has_liked`, so there is nothing local to preserve across it.
        const rows = page.data.map(withLikeState);
        setPosts((previous) => (reset ? rows : [...previous, ...rows]));
        applyFollowState(page.data, reset);
        adoptSavedState(page.data);
      } catch (caught) {
        failed.current = true;
        setError(caught instanceof Error ? caught.message : 'Could not load the feed.');
      } finally {
        inFlight.current = false;
      }
    },
    [token, applyFollowState, adoptSavedState]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load(true);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    atEnd.current = false;
    failed.current = false;
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const loadMore = useCallback(async () => {
    // Checked here and not only inside `load`, because the spinner this would
    // otherwise raise and drop is itself what re-fires `onEndReached` — bailing
    // out after touching it would still spin, just without the requests.
    if (atEnd.current || inFlight.current || failed.current) return;
    setLoadingMore(true);
    await load(false);
    setLoadingMore(false);
  }, [load]);

  const setFollowed = useCallback((userId: string, following: boolean) => {
    setFollowState((previous) => {
      if (previous.get(userId) === following) return previous;

      const next = new Map(previous);
      next.set(userId, following);
      return next;
    });
  }, []);

  const adoptFollowState = useCallback(
    (people: readonly { id: string; is_following?: boolean }[]) => {
      setFollowState((previous) => {
        // Built only once something actually moves: a page that agrees with
        // what is already held must not hand back a new map, or every list that
        // pages in re-renders each card in the feed behind it.
        let next: Map<string, boolean> | null = null;

        for (const person of people) {
          if (person.is_following === undefined) continue;
          if (previous.get(person.id) === person.is_following) continue;

          next ??= new Map(previous);
          next.set(person.id, person.is_following);
        }

        return next ?? previous;
      });
    },
    []
  );

  const setSaved = useCallback((postId: string, saved: boolean) => {
    setSavedPostIds((previous) => {
      if (previous.has(postId) === saved) return previous;

      const next = new Set(previous);
      if (saved) next.add(postId);
      else next.delete(postId);
      return next;
    });
  }, []);

  const applyLike = useCallback((postId: string, counts: LikeCounts) => {
    setPosts((previous) =>
      previous.map((post) =>
        post.id === postId
          ? {
              ...post,
              viewer_has_liked: counts.viewer_has_liked,
              // Floored, so a stale optimistic decrement can never flash a
              // negative count while the server's real answer is in flight.
              likes_count: Math.max(0, counts.likes_count),
            }
          : post
      )
    );
    patchPostState(postId, {
      viewer_has_liked: counts.viewer_has_liked,
      likes_count: Math.max(0, counts.likes_count),
    });
    // Named fields rather than a spread: the like endpoints answer with a
    // `post_id` alongside the counts, and spreading the whole reply would graft
    // that onto the post.
  }, [patchPostState]);

  const adjustComments = useCallback(
    (postId: string, change: { by: number } | { to: number }) => {
      setPosts((previous) =>
        previous.map((post) =>
          post.id === postId
            ? {
                ...post,
                comments_count: Math.max(
                  0,
                  'to' in change ? change.to : post.comments_count + change.by
                ),
              }
            : post
        )
      );

      setPostState((previous) => {
        const current = previous[postId];

        /*
         * `by` needs something to count from, and there is nothing to count
         * from for a post this context has never held. Callers drawing a post
         * from their own list pass `to` for that reason; the feed's own
         * counter above is already right either way.
         */
        const base = 'to' in change ? change.to : (current?.comments_count ?? NaN) + change.by;
        if (Number.isNaN(base)) return previous;

        return {
          ...previous,
          [postId]: { ...current, comments_count: Math.max(0, base) },
        };
      });
    },
    []
  );

  const [deletedPostIds, setDeletedPostIds] = useState<ReadonlySet<string>>(() => new Set());
  const [postEdits, setPostEdits] = useState<Readonly<Record<string, Post>>>({});

  /*
   * Marked rather than spliced out.
   *
   * The list is left as it was so that a delete the server refuses can be put
   * back exactly where it stood — filtering it out here would lose its place,
   * and re-inserting would guess at the order. What the reader sees is the
   * filtered view below; this set is the record.
   */
  const removePost = useCallback((postId: string) => {
    setDeletedPostIds((previous) => new Set(previous).add(postId));
  }, []);

  const restorePost = useCallback((postId: string) => {
    setDeletedPostIds((previous) => {
      if (!previous.has(postId)) return previous;

      const next = new Set(previous);
      next.delete(postId);
      return next;
    });
  }, []);

  const replacePost = useCallback((post: Post) => {
    setPostEdits((previous) => ({ ...previous, [post.id]: post }));
    setPosts((previous) => previous.map((item) => (item.id === post.id ? post : item)));
  }, []);

  const prepend = useCallback((post: Post) => {
    // Guarded against a refresh having already raced it in, which would
    // otherwise show the same post twice.
    setPosts((previous) =>
      previous.some((item) => item.id === post.id) ? previous : [withLikeState(post), ...previous]
    );
  }, []);

  // What the feed draws: everything still standing. Deleting a post takes it
  // off screen at once, without the list having to be rebuilt to do it.
  const visible = useMemo(
    () => posts.filter((post) => !deletedPostIds.has(post.id)),
    [posts, deletedPostIds]
  );

  const value = useMemo<FeedValue>(
    () => ({
      posts: visible,
      error,
      loading,
      loadingMore,
      refreshing,
      hasMore,
      refresh,
      loadMore,
      prepend,
      deletedPostIds,
      removePost,
      restorePost,
      postEdits,
      replacePost,
      followState,
      setFollowed,
      adoptFollowState,
      savedPostIds,
      setSaved,
      adoptSavedState,
      applyLike,
      adjustComments,
      postState,
      composingPostId,
      setComposingPost,
    }),
    [
      visible,
      error,
      loading,
      loadingMore,
      refreshing,
      hasMore,
      refresh,
      loadMore,
      prepend,
      deletedPostIds,
      removePost,
      restorePost,
      postEdits,
      replacePost,
      followState,
      setFollowed,
      adoptFollowState,
      savedPostIds,
      setSaved,
      adoptSavedState,
      applyLike,
      adjustComments,
      postState,
      composingPostId,
    ]
  );

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeed() {
  const context = use(FeedContext);
  if (!context) throw new Error('useFeed must be used inside <FeedProvider>');
  return context;
}
