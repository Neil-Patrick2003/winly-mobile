import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiDelete, apiPost } from '@/lib/api';

/**
 * Push notifications: the banner that arrives when the app is not open.
 *
 * The server side of this was already finished — `push_tokens`, the endpoint,
 * and a `SendPushNotification` action that runs on every notification written.
 * Nothing was arriving because nothing here ever asked for a token, so the
 * server's device list was empty and every send returned immediately.
 *
 * Expo's push service rather than FCM and APNs directly: one token and one
 * request reach both platforms, and the backend already speaks it.
 */

/**
 * How an arriving notification is presented while the app is open.
 *
 * Registered at module load rather than in a hook, because a notification can
 * arrive before any screen has mounted and the handler has to be in place by
 * then. Banners show in the foreground too: the websocket already updates the
 * bell, but the bell is a number in a corner and the point of this is to be
 * seen.
 *
 * Native only, and the guard has to be here rather than at the call sites:
 * anything this module touches at load runs the moment it is imported, and on
 * web `expo-notifications` answers its native methods with "not available on
 * web" — which at module scope is a blank page rather than a missing feature.
 */
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      /** The strip across the top of the screen. */
      shouldShowBanner: true,
      /** And a row in the notification centre, so it can be found again. */
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/** What the backend records alongside the token. */
type PushPlatform = 'ios' | 'android' | 'web';

/**
 * The EAS project the token is minted against.
 *
 * Expo will not issue one without it, and it is the project whose FCM and APNs
 * credentials actually deliver the push — so a wrong id here is a token that is
 * accepted and never rings.
 */
function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;

  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Android shows a heads-up banner only for a channel that asks for one.
 *
 * Without this every push lands silently in the drawer — which reads exactly
 * like push not working at all. `MAX` is what puts it over whatever is on
 * screen; the name is what the user sees in the system settings for the app.
 */
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Welle',
    importance: Notifications.AndroidImportance.MAX,
    lightColor: '#2E7D56',
    vibrationPattern: [0, 250, 250, 250],
  });
}

/**
 * Ask for permission, mint a token, and tell the server where to reach this
 * device. Returns the token so signing out can take it back off the list.
 *
 * Null covers every honest reason there is nothing to register — not a real
 * device, permission refused, the platform cannot do it — and none of them is
 * an error worth surfacing. Push is a courtesy on top of notifications that are
 * already being written and shown in the app.
 */
export async function registerForPush(authToken: string): Promise<string | null> {
  /*
   * Every reason to stop is reported in development and silent in production.
   *
   * All of them are ordinary — a simulator, the web build, a refused prompt —
   * and none is worth interrupting somebody over. But they are indistinguishable
   * from the outside: the only symptom is that no notification ever arrives, and
   * without this the answer to "why" is an empty `push_tokens` table and nothing
   * else to go on.
   */
  const skip = (reason: string) => {
    if (__DEV__) console.info(`[welle] Push not registered: ${reason}`);
    return null;
  };

  /*
   * Simulators cannot receive a push, and asking would only teach somebody to
   * dismiss the permission prompt before they have ever seen why it is worth
   * granting. The prompt should come from a real device where it can pay off.
   */
  if (!Device.isDevice) return skip('not a physical device');

  // Web push needs a service worker and VAPID keys wired to the Expo project,
  // which this app has not set up — so it is skipped rather than half-asked.
  if (Platform.OS === 'web') return skip('web has no push set up');

  const id = projectId();
  if (!id) return skip('no EAS projectId in app config');

  try {
    await ensureAndroidChannel();

    // Only ask where it has not already been answered: `requestPermissions`
    // re-prompts on Android and is a no-op on iOS once decided, and checking
    // first keeps the decided case to a cheap read.
    const existing = await Notifications.getPermissionsAsync();
    const granted =
      existing.granted ||
      (await Notifications.requestPermissionsAsync()).granted;

    if (!granted) return skip('permission was refused');

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });

    await apiPost('/api/v1/push-tokens', { token: data, platform: Platform.OS as PushPlatform }, authToken);

    return data;
  } catch (caught) {
    /*
     * Swallowed on purpose. This runs on sign-in, and a device that cannot be
     * registered — no credentials configured, no network, permission revoked
     * between the check and the mint — must not stop somebody using the app.
     *
     * The message is the useful part in development: "Cannot find native module
     * 'ExpoPushTokenManager'" means the binary predates the package and needs
     * rebuilding, which is not something an empty table would ever have said.
     */
    return skip(caught instanceof Error ? caught.message : 'unknown error');
  }
}

/**
 * Take this device off the list.
 *
 * Called before signing out, while the auth token still works: the endpoint
 * scopes the delete to the caller, so afterwards there is no way to say it. A
 * token left behind is somebody else's phone buzzing with your notifications
 * once they sign in on it.
 */
export async function unregisterFromPush(pushToken: string, authToken: string): Promise<void> {
  try {
    await apiDelete(`/api/v1/push-tokens?token=${encodeURIComponent(pushToken)}`, authToken);
  } catch {
    // Nothing to do: the sign-out itself matters more, and the server drops a
    // token as soon as Expo reports it dead.
  }
}
