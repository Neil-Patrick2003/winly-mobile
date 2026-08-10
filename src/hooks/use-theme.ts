/**
 * The raw colour values for the active scheme, for props that take a value
 * rather than a class (`tintColor`, `placeholderTextColor`, chart fills).
 *
 * The app is light-only today, so this always resolves to `Colors.light` — see
 * `use-color-scheme.ts`. Reading through the hook rather than `Colors.light`
 * directly means these callers come along for the ride if that ever changes.
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  return Colors[useColorScheme()];
}
