/**
 * Loads the Winly brand type stack: Plus Jakarta Sans (logo), Sora (headings),
 * Inter (body). The keys registered here are the family names in `Fonts`.
 * https://docs.expo.dev/versions/v57.0.0/sdk/font/
 */

import { useFonts } from 'expo-font';

import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';

export function useBrandFonts() {
  const [loaded, error] = useFonts({
    PlusJakartaSans_700Bold,
    Sora_600SemiBold,
    Sora_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Render on error too — the platform default is a better outcome than a
  // permanently blank app if a face fails to load.
  return loaded || !!error;
}
