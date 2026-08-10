/**
 * Loads the Welle brand type stack: Plus Jakarta Sans (logo), Playfair Display
 * (headings), Inter (body). The keys registered here are the family names in
 * `Fonts`. https://docs.expo.dev/versions/v57.0.0/sdk/font/
 *
 * Body is still Inter. Satoshi is a Fontshare face rather than a Google one, so
 * there is no package to install — it needs its files sitting in `assets/fonts`
 * before it can be registered alongside these.
 */

import { useFonts } from 'expo-font';

import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import {
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

export function useBrandFonts() {
  const [loaded, error] = useFonts({
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Render on error too — the platform default is a better outcome than a
  // permanently blank app if a face fails to load.
  return loaded || !!error;
}
