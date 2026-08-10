import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth-context';
import {
  disconnectEcho,
  getEcho,
  isRealtimeConfigured,
  isRealtimeUnreachable,
  resetRealtime,
  userChannel,
} from '@/lib/echo';
import type { AppNotification } from '@/lib/notifications';

/**
 * Listen for notifications arriving over the socket.
 *
 * Subscribes to the signed-in person's private channel and hands each arrival
 * to `onArrive`. The subscription follows the token: signing out tears the
 * socket down rather than leaving one open under credentials nobody holds any
 * more.
 *
 * Silently does nothing when no Reverb key is configured, which is how the web
 * build and any environment without a socket server keep working — they fall
 * back to the polling that is already there.
 */
export function useLiveNotifications(onArrive: (notification: AppNotification) => void) {
  const { token, user } = useAuth();
  const userId = user?.id;

  /*
   * Bumped to ask for a fresh connection attempt after one was given up on.
   * Part of the dependencies below, so changing it rebuilds the subscription.
   */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isRealtimeConfigured || !token || !userId) return;

    const echo = getEcho(token);
    if (!echo) return;

    const channel = echo.private(userChannel(userId));
    channel.listen('.notification.created', (payload: { notification: AppNotification }) => {
      if (payload?.notification) onArrive(payload.notification);
    });

    return () => {
      // Leave the channel but keep the socket: other listeners may be using it,
      // and reconnecting on every screen change would be worse than holding one
      // connection open.
      echo.leaveChannel(`private-${userChannel(userId)}`);
    };
  }, [token, userId, onArrive, attempt]);

  /*
   * Try again when the app is opened after being away.
   *
   * The likeliest reason the socket failed is a network that has since changed
   * — a phone that was on mobile data at launch, or a laptop that was asleep.
   * Only fires when the socket was actually given up on, so a healthy
   * connection is left alone.
   */
  useEffect(() => {
    if (!isRealtimeConfigured) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !isRealtimeUnreachable()) return;

      resetRealtime();
      setAttempt((previous) => previous + 1);
    });

    return () => subscription.remove();
  }, []);

  // One place owns closing the socket, and it is signing out.
  useEffect(() => {
    if (!token) disconnectEcho();
  }, [token]);
}
