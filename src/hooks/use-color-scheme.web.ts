/**
 * Light-only on web too — see the native `use-color-scheme.ts` for why.
 *
 * A constant also removes the hydration dance this file used to need: the
 * server-rendered markup and the client's first paint now always agree.
 */
export function useColorScheme(): 'light' {
  return 'light';
}
