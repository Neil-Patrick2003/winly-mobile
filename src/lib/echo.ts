import type Echo from 'laravel-echo';
import type PusherClient from 'pusher-js';

import { API_BASE_URL } from '@/lib/api';

/**
 * The two libraries, loaded on the first connection rather than at import.
 *
 * Types only above, and `require` here, because a static import runs while the
 * app is still starting up and cannot be caught. `pusher-js`'s React Native
 * build pulls in `@react-native-community/netinfo`, which is a native module —
 * so on a dev client built before it was installed, importing it throws
 * "Cannot read property 'EventEmitter' of undefined" before the runtime is
 * ready, taking the whole app down at launch.
 *
 * Realtime is an optional extra with a working fallback in polling. It has no
 * business being able to stop the app from starting, so it is not loaded until
 * something actually wants a socket, and failing to load is just a socket that
 * does not happen.
 *
 * `pusher-js` also ships three builds that disagree about how they export: the
 * web and node ones are the class, while the React Native one is `{ Pusher }`.
 * Metro takes the last of those, which is why the unwrapping is needed at all.
 */
function loadRealtime(): {
  EchoCtor: new (options: object) => EchoClient;
  PusherCtor: new (key: string, options: object) => PusherClient;
} | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate: a static import runs at module load, where this cannot be caught.
    const echoModule = require('laravel-echo') as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate: see above.
    const pusherModule = require('pusher-js') as Record<string, unknown>;

    return {
      EchoCtor: (echoModule.default ?? echoModule) as new (options: object) => EchoClient,
      PusherCtor: (pusherModule.Pusher ??
        pusherModule.default ??
        pusherModule) as new (key: string, options: object) => PusherClient,
    };
  } catch (caught) {
    console.warn(
      '[welle] Realtime is unavailable: the websocket libraries could not be loaded. ' +
        'Notifications will arrive on the slower poll. On a device this usually means the dev ' +
        'client predates `@react-native-community/netinfo` and needs rebuilding.',
      caught
    );

    return null;
  }
}

/**
 * Where the websocket server is.
 *
 * Defaults derived from `EXPO_PUBLIC_API_URL` rather than hardcoded, because
 * the two move together: on the simulator the API is a `.test` hostname and
 * Reverb is on the same machine, and on a physical device both have to be
 * reachable at the machine's LAN address. Override either explicitly when they
 * diverge — a tunnelled API with a local Reverb, for instance.
 */
const apiHost = /^https?:\/\/([^/:]+)/i.exec(API_BASE_URL)?.[1] ?? 'localhost';
const apiIsSecure = API_BASE_URL.startsWith('https');

const HOST = process.env.EXPO_PUBLIC_REVERB_HOST ?? apiHost;
const PORT = Number(process.env.EXPO_PUBLIC_REVERB_PORT ?? (apiIsSecure ? 443 : 8080));
const SCHEME = process.env.EXPO_PUBLIC_REVERB_SCHEME ?? (apiIsSecure ? 'https' : 'http');
const KEY = process.env.EXPO_PUBLIC_REVERB_KEY ?? '';

/** Whether a socket can be attempted at all. Without a key, nothing can connect. */
export const isRealtimeConfigured = KEY.length > 0;

type EchoClient = Echo<'reverb'>;

let echo: EchoClient | null = null;
let echoToken: string | null = null;

/**
 * How many rounds of failed attempts to allow before giving up on the socket.
 *
 * More than one because a phone that is between networks at launch fails the
 * first round and would otherwise lose realtime for the rest of the session.
 * Few enough that a host with no Reverb behind it goes quiet quickly instead of
 * printing a red line for ever.
 */
const MAX_FAILED_ROUNDS = 3;

let failedRounds = 0;

/**
 * Set once the socket has failed often enough to stop trying.
 *
 * `pusher-js` otherwise retries indefinitely, and every attempt is another
 * console error. Polling already covers notifications, so the honest behaviour
 * is to try, say so once, and stop until something changes.
 */
let unreachable = false;

/**
 * The one Echo client, built on first use and reused after.
 *
 * Rebuilt when the token changes — signing out and back in as somebody else
 * must not keep listening with the previous person's credentials, since the
 * token is what authorises every private channel.
 */
export function getEcho(token: string): EchoClient | null {
  if (!isRealtimeConfigured || unreachable) return null;

  if (echo && echoToken === token) return echo;

  disconnectEcho();

  const loaded = loadRealtime();

  if (loaded === null) {
    // Latched, so the failed require is not retried on every render. Polling
    // carries the notifications from here.
    unreachable = true;
    return null;
  }

  const { EchoCtor, PusherCtor } = loaded;

  echo = new EchoCtor({
    broadcaster: 'reverb',
    client: new PusherCtor(KEY, {
      wsHost: HOST,
      wsPort: PORT,
      wssPort: PORT,
      forceTLS: SCHEME === 'https',
      // Websockets only. The HTTP fallbacks are browser transports that do not
      // exist in React Native, and offering them only delays the failure.
      enabledTransports: ['ws', 'wss'],
      disableStats: true,
      cluster: '',
      /*
       * Private channels are authorised by the API, not by Reverb.
       *
       * Laravel's own `/broadcasting/auth` runs on the `web` guard and expects
       * a session cookie; this client has a bearer token, so it uses the
       * endpoint inside the authenticated API group instead.
       */
      // Annotated because the options are handed to a constructor loaded at
      // runtime, so there is no signature here for these to be inferred from.
      authorizer: (channel: { name: string }) => ({
        authorize: (socketId: string, callback: (error: Error | null, data: unknown) => void) => {
          fetch(`${API_BASE_URL}/api/v1/broadcasting/auth`, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              'ngrok-skip-browser-warning': 'true',
            },
            body: JSON.stringify({ socket_id: socketId, channel_name: channel.name }),
          })
            .then(async (response) => {
              if (!response.ok) throw new Error(`auth ${response.status}`);
              callback(null, await response.json());
            })
            .catch((caught) => callback(caught as Error, null));
        },
      }),
    }),
  });

  /*
   * Stop after a few failed rounds rather than retry for ever.
   *
   * `unavailable` is `pusher-js` reporting that a round of attempts came to
   * nothing, and `failed` that websockets are unavailable outright. A single
   * `unavailable` means little — a phone changing networks produces one — so
   * only a run of them is taken as "there is nothing there".
   */
  const connection = (echo.connector as { pusher: PusherClient }).pusher.connection;
  connection.bind('state_change', ({ current }: { current: string }) => {
    if (current === 'connected') {
      failedRounds = 0;
      return;
    }

    if (current !== 'unavailable' && current !== 'failed') return;

    failedRounds += 1;
    if (failedRounds < MAX_FAILED_ROUNDS) return;

    unreachable = true;
    console.warn(
      `[welle] Realtime gave up: nothing answered at ${SCHEME === 'https' ? 'wss' : 'ws'}://${HOST}:${PORT}/app. ` +
        'Notifications still arrive on the slower poll. Either Reverb is not running there, or /app is not ' +
        'proxied to it — or set EXPO_PUBLIC_REVERB_HOST/PORT to somewhere reachable.'
    );
    disconnectEcho();
  });

  echoToken = token;
  return echo;
}

/**
 * Close the socket and forget it.
 *
 * Called on sign-out. Leaving it open would keep a connection authorised as
 * somebody who is no longer signed in.
 */
export function disconnectEcho() {
  echo?.disconnect();
  echo = null;
  echoToken = null;
}

/** Whether the socket has been given up on for this session. */
export const isRealtimeUnreachable = () => unreachable;

/**
 * Allow the socket to be attempted again.
 *
 * Called when something has plausibly changed — the app returning to the
 * foreground on a different network, most often. Not called on a timer, because
 * an address with nothing behind it does not improve by being asked again.
 */
export function resetRealtime() {
  unreachable = false;
  failedRounds = 0;
}

/** The private channel carrying one person's notifications. */
export const userChannel = (userId: string) => `users.${userId}`;
