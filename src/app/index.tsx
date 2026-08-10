import { Link, Redirect } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LeafDivider } from '@/components/leaf';
import { Image } from '@/components/ui/image';
import { Wordmark } from '@/components/wordmark';
import { useAuth } from '@/lib/auth-context';

/**
 * The welcome illustration is a fixed light artwork, and dark-scheme text would
 * disappear against it. The whole app is pinned light in the root layout, so
 * that is handled — which is why there are no `dark:` variants here.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();

  // A stored token was already exchanged for a user before the navigator
  // mounted, so anyone still signed in skips the sign-up pitch entirely.
  if (isAuthenticated) return <Redirect href="/(tabs)/home" />;

  return (
    <View className="flex-1 bg-surface">
      <Image
        source={require('@/assets/images/illustrations/welcome_bg2.png')}
        className="absolute inset-0 opacity-90"
        contentFit="cover"
        contentPosition="bottom center"
      />

      <View
        className="w-full max-w-[800px] flex-1 select-none justify-between self-center px-4"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}>
        <View className="items-center gap-2 pt-8">
          <Image
            source={require('@/assets/images/brand/welle_logo.png')}
            className="h-[120px] w-[148px]"
            contentFit="cover"
          />
          <Wordmark />
          <Text className="text-center font-sans text-sm leading-6 text-ink-muted">
            True Wealth Starts Within.
          </Text>
          <LeafDivider />
          <Text className="text-center font-sans text-sm leading-6 text-ink-muted">
            Welle is a positive community where you can share your self-care, celebrate small wins,
            and grow together.
          </Text>
        </View>

        {/* Both buttons sit over the dark foliage at the foot of the artwork,
            which is what lets the outlined one be drawn in light at all — the
            same pair over the pale sky above would be invisible.

            Filled for the way in, outlined for the way back: the pairing the
            rest of the app uses for a choice with one obvious answer. */}
        <View className="gap-2">
          <Link href="/login" asChild>
            <Pressable
              accessibilityRole="button"
              className="items-center rounded-full bg-primary py-4 active:opacity-85">
              <Text className="font-body-semibold text-base leading-6 text-primary-fg">
                Login
              </Text>
            </Pressable>
          </Link>

          <Link href="/register" asChild>
            <Pressable
              accessibilityRole="button"
              // `border-primary-fg` rather than a cream from Tailwind's own
              // scale: the Forest palette has no amber, and this is the same
              // white the filled button's label is set in.
              className="items-center rounded-full border border-primary-fg py-4 active:opacity-85">
              <Text className="font-body-semibold text-base leading-6 text-primary-fg">
                Create an Account
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </View>
  );
}
