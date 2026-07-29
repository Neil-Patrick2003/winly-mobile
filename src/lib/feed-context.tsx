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
   * Authors the viewer follows, as far as this session knows.
   *
   * Seeded empty, because the feed does not say: `UserSummaryResource` carries
   * no `is_following`, so a post by someone already followed still offers to
   * follow them. That is harmless — the endpoint is idempotent and will not
   * double-count — but it is why this cannot be trusted as the truth, only as
   * what the viewer has done since the app opened.
   */
  followedIds: ReadonlySet<string>;
  setFollowed: (userId: string, following: boolean) => void;
  /**
   * Posts the viewer has saved.
   *
   * Session-only, and deliberately so: the API has no bookmark endpoint, so
   * there is nowhere to put this. It survives scrolling — which per-card state
   * would not, since the list recycles rows — and nothing more.
   */
  savedPostIds: ReadonlySet<string>;
  toggleSaved: (postId: string) => void;
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
  const [followedIds, setFollowedIds] = useState<ReadonlySet<string>>(() => new Set());
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
   * A reset — first load or pull-to-refresh — rebuilds the set from scratch, so
   * a follow undone elsewhere (another device, or a row deleted straight out of
   * the database) is picked up rather than remembered forever. Loading a further
   * page only adds to it, since those posts say nothing about authors already
   * seen.
   */
  const applyFollowState = useCallback((page: Post[], reset: boolean) => {
    setFollowedIds((previous) => {
      const next = new Set(reset ? [] : previous);

      for (const { author } of page) {
        if (author.is_following === undefined) {
          // Unknown: keep whatever was already believed about them.
          if (previous.has(author.id)) next.add(author.id);
          continue;
        }

        if (author.is_following) next.add(author.id);
        else next.delete(author.id);
      }

      return next;
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
      } catch (caught) {
        failed.current = true;
        setError(caught instanceof Error ? caught.message : 'Could not load the feed.');
      } finally {
        inFlight.current = false;
      }
    },
    [token, applyFollowState]
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
    setFollowedIds((previous) => {
      if (previous.has(userId) === following) return previous;

      const next = new Set(previous);
      if (following) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }, []);

  const toggleSaved = useCallback((postId: string) => {
    setSavedPostIds((previous) => {
      const next = new Set(previous);
      if (!next.delete(postId)) next.add(postId);
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

  const prepend = useCallback((post: Post) => {
    // Guarded against a refresh having already raced it in, which would
    // otherwise show the same post twice.
    setPosts((previous) =>
      previous.some((item) => item.id === post.id) ? previous : [withLikeState(post), ...previous]
    );
  }, []);

  const value = useMemo<FeedValue>(
    () => ({
      posts,
      error,
      loading,
      loadingMore,
      refreshing,
      hasMore,
      refresh,
      loadMore,
      prepend,
      followedIds,
      setFollowed,
      savedPostIds,
      toggleSaved,
      applyLike,
      adjustComments,
      postState,
      composingPostId,
      setComposingPost,
    }),
    [
      posts,
      error,
      loading,
      loadingMore,
      refreshing,
      hasMore,
      refresh,
      loadMore,
      prepend,
      followedIds,
      setFollowed,
      savedPostIds,
      toggleSaved,
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
