import '@/global.css';

import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { ScopedTheme } from 'uniwind';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Colors } from '@/constants/theme';
import { useBrandFonts } from '@/hooks/use-brand-fonts';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { FeedProvider } from '@/lib/feed-context';
import { ToastProvider } from '@/lib/toast';

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

/**
 * The app is light-only, pinned here rather than screen by screen: `ThemeProvider`
 * covers the navigator's own chrome, `ScopedTheme` covers the uniwind class
 * tokens (`bg-surface`, `text-ink`, …), and `useColorScheme` reports light to
 * everything else. See `hooks/use-color-scheme.ts` for how to undo it.
 *
 * The status bar is set once here too — it sits above the navigator, so a
 * screen would have to fight it rather than merely restate it.
 */
export default function RootLayout() {
  const fontsReady = useBrandFonts();

  // Keep the native splash up until the brand faces are registered, so text
  // never renders once in the fallback family and then reflows.
  if (!fontsReady) return null;

  return (
    <ThemeProvider value={LightTheme}>
      <ScopedTheme theme="light">
        <StatusBar style="dark" />
        <AuthProvider>
          {/* Above the navigator, so a confirmation outlives the screen that
              raised it — sharing a win dismisses the entry modal. */}
          <ToastProvider>
            {/* Above the navigator too, so sharing a win can drop the created
                post straight into the feed the tabs are showing. */}
            <FeedProvider>
              <AnimatedSplashOverlay />
              <RootNavigator />
            </FeedProvider>
          </ToastProvider>
        </AuthProvider>
      </ScopedTheme>
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
      <Stack.Screen name="messages" />
      {/* Pushed from a feed card's comment count, so it reads as going one
          level into that post rather than as a separate place. */}
      <Stack.Screen name="comments/[postId]" />
      {/* Stories take the whole screen and are watched, not navigated: the
          fade keeps the rail from sliding away under them, and composing one
          is a modal because it is a task you finish or abandon. */}
      <Stack.Screen
        name="story/[userId]"
        options={{ animation: 'fade', animationDuration: 200 }}
      />
      <Stack.Screen name="story/new" options={{ presentation: 'modal' }} />
      {/* Who watched one of yours — a modal over the story it belongs to, so
          closing it puts you back where the count was tapped. */}
      <Stack.Screen name="story/viewers/[storyId]" options={{ presentation: 'modal' }} />
      {/* Entering the app is a context change, not a push — and the swipe-back
          gesture is disabled so you cannot slide back into the auth flow. */}
      <Stack.Screen
        name="(tabs)"
        options={{ animation: 'fade', animationDuration: 300, gestureEnabled: false }}
      />
      {/* The Share-a-win flow presents over the tabs — full screen, its own top
          bar, dismissed by the flow's close control. */}
      <Stack.Screen name="entry" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
