import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth-context';
import { fetchUnreadCount } from '@/lib/notifications';
import { useLiveNotifications } from '@/lib/use-live-notifications';

/**
 * How often to ask, while the app is in front.
 *
 * A backstop, not the mechanism. Arrivals come down the socket and move the
 * badge immediately; this only catches whatever a dropped connection missed,
 * and covers the web build, which has no socket configured. Hence a slow tick
 * rather than a fast one.
 */
const POLL_MS = 45_000;

/**
 * The unread badge on the bell.
 *
 * Asked on focus, on returning from the background, and on a slow tick while
 * the app is in front. It deliberately stops when the app is backgrounded:
 * polling a server nobody is looking at spends battery for nothing.
 */
export function useUnreadNotifications() {
  const { token } = useAuth();
  const [unread, setUnread] = useState(0);
  const active = useRef(true);

  const refresh = useCallback(async () => {
    if (!token) return;

    try {
      const count = await fetchUnreadCount(token);
      if (active.current) setUnread(count);
    } catch {
      // A badge that cannot be fetched simply does not move. There is nothing
      // worth interrupting anybody over.
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      active.current = true;
      void refresh();

      const timer = setInterval(() => void refresh(), POLL_MS);

      // Coming back from the background is the moment most likely to have
      // something waiting, and the tick above was not running while away.
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void refresh();
      });

      return () => {
        active.current = false;
        clearInterval(timer);
        subscription.remove();
      };
    }, [refresh])
  );

  // An arrival is worth exactly one on the badge — asking the server again
  // would be a round trip to learn what the socket just said.
  const bump = useCallback(() => setUnread((count) => count + 1), []);
  useLiveNotifications(bump);

  return { unread, refresh, clear: useCallback(() => setUnread(0), []) };
}
