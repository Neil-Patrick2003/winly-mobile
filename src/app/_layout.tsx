import '@/global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Colors } from '@/constants/theme';
import { useBrandFonts } from '@/hooks/use-brand-fonts';
import { AuthProvider, useAuth } from '@/lib/auth-context';

SplashScreen.preventAutoHideAsync();

/**
 * `slide_from_right` and `ios_from_right` are Android-only — on iOS the native
 * push *is* `default`, so asking for a named slide there does nothing. Android
 * gets `ios_from_right` to match iOS's horizontal push instead of its own
 * fade-up default, so the two platforms feel the same.
 */
const PUSH = Platform.OS === 'android' ? ('ios_from_right' as const) : ('default' as const);

/**
 * Sign-in and sign-up cross-link to each other with `replace`, so they trade
 * places rather than stacking. A cross-fade reads as a swap; a horizontal push
 * would imply you had gone one level deeper.
 */
const SWAP = { animation: 'fade' as const, animationDuration: 220 };

const LightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.light.primary,
    background: Colors.light.background,
    card: Colors.light.backgroundElement,
    text: Colors.light.text,
    border: Colors.light.border,
  },
};

const NightTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.dark.primary,
    background: Colors.dark.background,
    card: Colors.dark.backgroundElement,
    text: Colors.dark.text,
    border: Colors.dark.border,
  },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const fontsReady = useBrandFonts();

  // Keep the native splash up until the brand faces are registered, so text
  // never renders once in the fallback family and then reflows.
  if (!fontsReady) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? NightTheme : LightTheme}>
      <AuthProvider>
        <AnimatedSplashOverlay />
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { isRestoring } = useAuth();

  // Reading the stored token is async. Holding the tree until it resolves keeps
  // a returning user from seeing the welcome screen flash before the redirect —
  // the splash overlay is a sibling, so it stays up over this.
  if (isRestoring) return null;

  return (
    /* The welcome screen sits outside the tab navigator so it renders
       full-bleed, with no tab bar. `/(tabs)` is the app proper. */
    <Stack screenOptions={{ headerShown: false, animation: PUSH, animationDuration: 260 }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="register" options={SWAP} />
      <Stack.Screen name="login" options={SWAP} />
      <Stack.Screen name="settings" />
      {/* Entering the app is a context change, not a push — and the swipe-back
          gesture is disabled so you cannot slide back into the auth flow. */}
      <Stack.Screen
        name="(tabs)"
        options={{ animation: 'fade', animationDuration: 300, gestureEnabled: false }}
      />
      {/* The ESC entry flow presents over the tabs — full screen, its own top
          bar, dismissed by the flow's close control. */}
      <Stack.Screen name="entry" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
