/**
 * Winly is a light-only app. Every surface is designed against the light
 * palette — the welcome artwork and the Share flow's pillar accents are fixed
 * light-mode values — so this reports light regardless of the device setting,
 * rather than each screen pinning itself.
 *
 * The dark half of `Colors` and the `@variant dark` block in global.css are
 * kept for when that changes. To follow the system again, restore the
 * re-export below and drop the `<ScopedTheme theme="light">` in the root layout.
 *
 *   export { useColorScheme } from 'react-native';
 */
export function useColorScheme(): 'light' {
  return 'light';
}
