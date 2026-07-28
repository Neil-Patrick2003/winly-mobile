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
import { fetchFeed, type Post } from '@/lib/posts';

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

  const cursor = useRef<string | null>(null);
  const atEnd = useRef(false);
  const inFlight = useRef(false);

  const load = useCallback(
    async (reset: boolean) => {
      if (!token || inFlight.current) return;
      if (!reset && atEnd.current) return;

      inFlight.current = true;
      setError(null);

      try {
        const page = await fetchFeed(token, reset ? undefined : (cursor.current ?? undefined));
        cursor.current = page.meta.next_cursor;
        atEnd.current = page.meta.next_cursor === null;
        setHasMore(!atEnd.current);
        setPosts((previous) => (reset ? page.data : [...previous, ...page.data]));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not load the feed.');
      } finally {
        inFlight.current = false;
      }
    },
    [token]
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
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const loadMore = useCallback(async () => {
    if (atEnd.current || inFlight.current) return;
    setLoadingMore(true);
    await load(false);
    setLoadingMore(false);
  }, [load]);

  const prepend = useCallback((post: Post) => {
    // Guarded against a refresh having already raced it in, which would
    // otherwise show the same post twice.
    setPosts((previous) =>
      previous.some((item) => item.id === post.id) ? previous : [post, ...previous]
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
    }),
    [posts, error, loading, loadingMore, refreshing, hasMore, refresh, loadMore, prepend]
  );

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeed() {
  const context = use(FeedContext);
  if (!context) throw new Error('useFeed must be used inside <FeedProvider>');
  return context;
}
