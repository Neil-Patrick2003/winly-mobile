import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/lib/auth-context';

/**
 * What the server puts in a push's `data`, and all this needs from it.
 *
 * Mirrors the notification row: a post id where the thing happened to a post,
 * and an actor where it did not — a follow has no post, and its only sensible
 * destination is the person who did it.
 */
type PushPayload = {
  post_id?: string | null;
  actor_id?: string | null;
};

/** Where a tapped notification should land. */
function destinationFor(payload: PushPayload) {
  if (payload.post_id) {
    return { pathname: '/comments/[postId]' as const, params: { postId: payload.post_id } };
  }

  if (payload.actor_id) {
    return { pathname: '/users/[userId]' as const, params: { userId: payload.actor_id } };
  }

  // Nothing specific to open — the list is the honest fallback, and it is where
  // the notification is written down anyway.
  return '/notifications' as const;
}

/**
 * Open the right screen when somebody taps a push.
 *
 * Two cases, and both matter. A tap while the app is running is an event; a tap
 * that *launched* the app happened before any listener existed, so it has to be
 * asked for once on mount — without that, opening the app from a notification
 * lands on the home screen and the tap appears to have done nothing.
 *
 * Guarded on being signed in: every destination is behind auth, and pushing a
 * route before the session is restored would bounce straight back to sign-in
 * and lose where they were going.
 */
export function usePushTaps() {
  const { isAuthenticated, isRestoring } = useAuth();

  // A launch tap is answered once. Without this it would fire again on every
  // re-render that changed the guard — reopening the same post under whatever
  // the person had since navigated to.
  const handledLaunch = useRef(false);

  useEffect(() => {
    if (isRestoring || !isAuthenticated) return;

    const open = (response: Notifications.NotificationResponse) => {
      const payload = (response.notification.request.content.data ?? {}) as PushPayload;
      router.push(destinationFor(payload));
    };

    if (!handledLaunch.current) {
      handledLaunch.current = true;
      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) open(response);
      });
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [isAuthenticated, isRestoring]);
}
