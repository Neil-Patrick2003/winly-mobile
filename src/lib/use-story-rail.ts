import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/lib/auth-context';
import { fetchFollows, type UserSummary } from '@/lib/stories';

/**
 * How many empty pages to chase before giving up for this scroll.
 *
 * Only people with a live story appear in the rail, and that is filtered here
 * rather than by the server — so a page of twenty can contribute nobody. Left
 * alone, the rail would sit empty with a cursor still in hand and no way to
 * ask for more, because `onEndReached` never fires on a list that does not
 * overflow. The bound is what stops a large following list from being walked
 * end to end in one go.
 */
const MAX_CHAINED_PAGES = 3;

/**
 * The people whose stories belong in the rail: those the signed-in user
 * follows, narrowed to whoever has one live right now.
 *
 * Paginated by the rail itself as it scrolls sideways — the cursor advances
 * horizontally, independently of the feed underneath it.
 */
export function useStoryRail() {
  const { user, token } = useAuth();
  const userId = user?.id ?? null;

  const [people, setPeople] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const cursor = useRef<string | null>(null);
  const atEnd = useRef(false);
  const inFlight = useRef(false);
  /**
   * Set when a page fetch fails, and what stops the rail from asking again on
   * its own. See the same guard in `feed-context.tsx` for why it is needed:
   * `onEndReached` re-fires for every new content length, and the footer spinner
   * changes the content length, so a failure that leaves `atEnd` false loops.
   *
   * The rail is the more exposed of the two, because it never overflows — one
   * bubble and a header are always within the end threshold, so it does not even
   * need a short feed to start.
   */
  const failed = useRef(false);

  const load = useCallback(
    async (reset: boolean) => {
      if (!token || !userId || inFlight.current) return;
      if (!reset && (atEnd.current || failed.current)) return;

      inFlight.current = true;
      failed.current = false;

      try {
        let next = reset ? undefined : (cursor.current ?? undefined);
        let gathered: UserSummary[] = [];
        let pages = 0;

        // Keep asking while the pages we get back hold nobody to show.
        do {
          const page = await fetchFollows(userId, 'following', token, next);

          cursor.current = page.meta.next_cursor;
          atEnd.current = page.meta.next_cursor === null;
          next = page.meta.next_cursor ?? undefined;

          gathered = gathered.concat(page.data.filter((person) => person.has_active_story));
          pages += 1;
        } while (gathered.length === 0 && !atEnd.current && pages < MAX_CHAINED_PAGES);

        setPeople((previous) => {
          if (reset) return gathered;

          // A refresh racing a page-in could otherwise seat the same person
          // twice, and a duplicate key is a hard error in a list.
          const seen = new Set(previous.map((person) => person.id));
          return previous.concat(gathered.filter((person) => !seen.has(person.id)));
        });
      } catch {
        // The rail is decoration around a feed that stands on its own. A story
        // list that will not load should not put an error where the greeting
        // is; it simply stays empty.
        failed.current = true;
      } finally {
        inFlight.current = false;
      }
    },
    [token, userId]
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

  const loadMore = useCallback(async () => {
    // Checked here and not only inside `load`, because the spinner this would
    // otherwise raise and drop is itself what re-fires `onEndReached`.
    if (atEnd.current || inFlight.current || failed.current) return;
    setLoadingMore(true);
    await load(false);
    setLoadingMore(false);
  }, [load]);

  const refresh = useCallback(async () => {
    atEnd.current = false;
    failed.current = false;
    cursor.current = null;
    await load(true);
  }, [load]);

  // No `hasMore`: the rail has no end-of-list message to earn one, and reading
  // `atEnd` here would be reading a ref during render — a value that changes
  // without scheduling the re-render that would show it.
  return { people, loading, loadingMore, loadMore, refresh };
}
