/**
 * Browser fallback for `token-storage.ts`.
 *
 * expo-secure-store has no web implementation — its web module is literally
 * empty — because the Keychain and Keystore have no browser equivalent. Browser
 * storage is readable by any script on the origin, so this is convenience, not
 * security: anything that can run JavaScript here can read the token.
 *
 * Which store depends on "Remember me":
 *
 *   - Remembered goes in `localStorage`, which outlives the tab and the browser.
 *   - Not remembered goes in `sessionStorage`, which is emptied when the tab
 *     closes and is not shared with other tabs. On a borrowed laptop that is the
 *     difference between a session that ends when the window does and one that
 *     is waiting for the next person.
 *
 * Whichever is written, the other is cleared, so the two can never disagree
 * about which token is current.
 *
 * The guards cover static rendering (`web.output` in app.json), where this runs
 * in Node with no `window`.
 */
const TOKEN_KEY = 'winly.auth.token';

export async function saveToken(token: string, remember: boolean) {
  if (typeof window === 'undefined') return;

  const [keep, drop] = remember
    ? [window.localStorage, window.sessionStorage]
    : [window.sessionStorage, window.localStorage];

  keep.setItem(TOKEN_KEY, token);
  drop.removeItem(TOKEN_KEY);
}

export async function loadToken() {
  if (typeof window === 'undefined') return null;

  // Session first: it is the more recent decision where both somehow exist.
  return window.sessionStorage.getItem(TOKEN_KEY) ?? window.localStorage.getItem(TOKEN_KEY);
}

export async function clearToken() {
  if (typeof window === 'undefined') return;

  window.sessionStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
}
