/**
 * Holds the Sanctum token for the current session in the device keystore —
 * the iOS Keychain and Android Keystore — so it survives reloads and relaunches.
 *
 * SecureStore is used over AsyncStorage because this is a credential: a bearer
 * token in AsyncStorage sits unencrypted in a SQLite file that a rooted device
 * or a device backup can read. Its ~2048-byte practical limit is far above a
 * Sanctum token.
 *
 * SecureStore is a native module, so it has to be compiled into the installed
 * binary — adding it to package.json is not enough, the dev build must be
 * rebuilt or the import throws "Cannot find native module 'ExpoSecureStore'".
 * See `token-storage.web.ts` for the web build, which uses browser storage.
 *
 * Reads and writes are defensive: a keystore failure should sign the user out,
 * never crash the app on launch.
 */

import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'winly.auth.token';

/**
 * Keep the token, or deliberately do not.
 *
 * `remember: false` writes nothing and clears anything already written. The
 * session still works — the token is held in memory by `AuthProvider` for as
 * long as the app is running — it simply does not outlive the process. That is
 * the whole of what "Remember me" is: not a weaker session, a shorter one.
 *
 * Clearing on the way past matters. Somebody who signed in with the box ticked
 * on a shared device, then signed in again without it, would otherwise still
 * have the first token sitting in the keystore.
 */
export async function saveToken(token: string, remember: boolean) {
  if (!remember) {
    await clearToken();
    return;
  }

  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    // Nothing actionable here — the session still works for this launch, it
    // just will not be restored on the next one.
  }
}

export async function loadToken() {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function clearToken() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Already gone, or unreadable. Either way there is nothing to remove.
  }
}
