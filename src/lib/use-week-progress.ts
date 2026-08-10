import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useAuth } from '@/lib/auth-context';
import { fetchWeekProgress, type WeekProgress } from '@/lib/progress';

/**
 * This week's wins, for the card on the home screen.
 *
 * Errors are surfaced rather than swallowed, unlike the story rail: an empty
 * rail says "nobody posted", which is a fair thing to show when the request
 * failed, but a week of empty rings says "you did nothing", which is not.
 */
export function useWeekProgress() {
  const { token } = useAuth();

  const [week, setWeek] = useState<WeekProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;

    try {
      setWeek(await fetchWeekProgress(token));
      setError(null);
    } catch (caught) {
      // What was already on screen stays there — a week that loaded a minute
      // ago is better company than a blank card while the connection sulks.
      setError(caught instanceof Error ? caught.message : 'Could not load your week.');
    }
  }, [token]);

  /*
   * Loaded on focus rather than on mount, which is what keeps the rings honest
   * after sharing a win.
   *
   * Sharing happens in a flow pushed over the home screen, so home is never
   * unmounted and a mount effect fires exactly once — the week a person sees
   * on returning would be the week as it stood before they logged anything,
   * until they thought to pull down. Coming back to the screen is the moment
   * the answer has changed.
   *
   * Only the first pass raises the spinner; later ones refresh in place, so
   * returning to the tab updates the card without blanking it.
   */
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        await load();
        if (!cancelled) setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  return { week, loading, error, refresh: load };
}
