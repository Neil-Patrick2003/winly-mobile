/**
 * Browser fallback for `token-storage.ts`.
 *
 * expo-secure-store has no web implementation — its web module is literally
 * empty — because the Keychain and Keystore have no browser equivalent.
 * `localStorage` keeps the web build working and is readable by any script on
 * the origin, so it is convenience, not security.
 *
 * The guards cover static rendering (`web.output: "static"` in app.json), where
 * this runs in Node with no `window`.
 */
const TOKEN_KEY = 'winly.auth.token';

export async function saveToken(token: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export async function loadToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export async function clearToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
}
