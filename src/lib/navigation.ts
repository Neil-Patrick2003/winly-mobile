import { router, type Href } from 'expo-router';

/**
 * Go back, or go somewhere sensible when there is nowhere to go back to.
 *
 * `router.back()` on its own assumes something is underneath, and on the web
 * that is often untrue: opening a URL directly, refreshing, or following a link
 * from outside all start the history at that screen. The dispatch then finds no
 * navigator willing to handle it and fails with "The action 'GO_BACK' was not
 * handled by any navigator", leaving the person stuck on a screen whose only
 * exit does nothing.
 *
 * `replace` rather than `push` for the fallback, so the abandoned screen does
 * not stay in history for the browser's own back button to return to.
 */
export function goBack(fallback: Href = '/(tabs)/home') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
