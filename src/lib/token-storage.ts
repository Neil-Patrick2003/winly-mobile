import * as SecureStore from 'expo-secure-store';

/**
 * Persists the Sanctum token in the iOS Keychain / Android Keystore.
 *
 * Surviving a reload is the point: without it every reload mints a fresh token
 * on the next sign-in and abandons the old one, which stays valid server-side
 * because logout only revokes the token it was called with.
 *
 * See `token-storage.web.ts` for the browser fallback.
 */
const TOKEN_KEY = 'winly.auth.token';

export async function saveToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function loadToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
