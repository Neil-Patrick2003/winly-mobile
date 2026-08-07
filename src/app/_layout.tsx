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
import { ConfirmProvider } from '@/lib/confirm';
import { FeedProvider } from '@/lib/feed-context';
import { ToastProvider } from '@/lib/toast';
import { usePushTaps } from '@/lib/use-push-taps';

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
            {/* Above the navigator for the same reason, and above it in the
                tree so its modal draws over every screen — a dialog asking
                whether to leave has to outlive the leaving. */}
            <ConfirmProvider>
              {/* Above the navigator too, so sharing a win can drop the created
                  post straight into the feed the tabs are showing. */}
              <FeedProvider>
                <AnimatedSplashOverlay />
                <RootNavigator />
              </FeedProvider>
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </ScopedTheme>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { isRestoring } = useAuth();

  // Inside the navigator, because it navigates: a tap has to reach a router
  // that is already mounted. Its own guards keep it quiet until there is a
  // session to open anything under.
  usePushTaps();

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
      {/* The two steps of a forgotten password. Pushed rather than swapped:
          they are a route onward from sign-in and from each other, not another
          way of doing the same thing, and the back gesture should walk them
          back one at a time. */}
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="settings" />
      {/* Reached from your own profile, and pushed rather than presented: it is
          a place you go and come back from, not a task you finish. */}
      <Stack.Screen name="saved" />
      <Stack.Screen name="messages" />
      {/* Left the tab bar when Circles took the slot, and pushed from the bell
          in the header instead. */}
      <Stack.Screen name="notifications" />
      <Stack.Screen name="admin/meditations" />
      {/* Editing your own details is a task you finish or abandon. */}
      <Stack.Screen name="profile/edit" options={{ presentation: 'modal' }} />
      {/* Somebody else's profile, reached from a post, a member list or a
          suggestion — a push, because it is one level into who they are. */}
      <Stack.Screen name="users/[userId]" />
      <Stack.Screen name="users/[userId]/follows" />
      {/* A circle and its members read as going one level into the list, so it
          pushes; starting one is a task you finish or abandon, so it is a
          modal. */}
      <Stack.Screen name="circles/[circleId]" />
      <Stack.Screen name="circles/[circleId]/members" />
      <Stack.Screen name="circles/[circleId]/invite" options={{ presentation: 'modal' }} />
      {/* Changing one is the same task as starting one, and is presented the
          same way. */}
      <Stack.Screen name="circles/[circleId]/edit" options={{ presentation: 'modal' }} />
      <Stack.Screen name="circles/new" options={{ presentation: 'modal' }} />
      {/* Pushed from a feed card's comment count, so it reads as going one
          level into that post rather than as a separate place. */}
      <Stack.Screen name="comments/[postId]" />
      {/* Rewriting a post is a task you finish or abandon, like editing your
          own details — so a modal, and for the same reason. */}
      <Stack.Screen name="posts/[postId]/edit" options={{ presentation: 'modal' }} />
      {/* Who liked a post — a modal over whichever card the count was tapped
          on, so closing it puts you back exactly where you were. Presented the
          same way as a story's viewers, which answers the same question. */}
      <Stack.Screen name="posts/[postId]/likes" options={{ presentation: 'modal' }} />
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
