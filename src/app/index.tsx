import { Link, Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeartDivider } from '@/components/heart';
import { Image } from '@/components/ui/image';
import { Wordmark } from '@/components/wordmark';
import { useAuth } from '@/lib/auth-context';

/**
 * The welcome illustration is a fixed light artwork, so this screen commits to
 * the light palette rather than following the system scheme — dark-scheme text
 * would disappear against it. That's why there are no `dark:` variants here.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();

  // A stored token was already exchanged for a user before the navigator
  // mounted, so anyone still signed in skips the sign-up pitch entirely.
  if (isAuthenticated) return <Redirect href="/(tabs)/home" />;

  return (
    <View className="flex-1 bg-surface">
      <StatusBar style="dark" />

      <Image
        source={require('@/assets/images/illustrations/welcome_bg.png')}
        className="absolute inset-0"
        contentFit="cover"
        contentPosition="bottom center"
      />

      <View
        className="w-full max-w-[800px] flex-1 select-none justify-between self-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}>
        <View className="items-center gap-2 pt-8">
          <Image
            source={require('@/assets/images/brand/logo.png')}
            className="h-[120px] w-[148px]"
            contentFit="cover"
          />
          <Wordmark />
          <HeartDivider />
          <Text className="text-center font-sans text-sm leading-6 text-ink-muted">
            Your Feed for Personal Growth
          </Text>

          <View className="flex-row">
            <Text className="text-xl font-extrabold text-green-400">Share </Text>
            <Text className="text-xl font-extrabold">your </Text>
            <Text className="text-xl font-extrabold text-blue-400">Journey</Text>
            <Text className="text-xl font-extrabold">.</Text>
          </View>
          <View className="flex-row">
            <Text className="text-xl font-extrabold text-violet-400">Inspire </Text>
            <Text className="text-xl font-extrabold">others.</Text>
          </View>

          <Text className="text-center font-sans text-sm leading-6 text-ink-muted">
            Winly is a positive community where you can share your self-care, celebrate small wins,
            and grow together.
          </Text>
        </View>

        <View className="gap-2">
          <Link href="/register" asChild>
            <Pressable
              accessibilityRole="button"
              className="items-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500 py-4 active:opacity-85"
              style={{ boxShadow: '0 8px 20px rgba(34, 197, 94, 0.35)' }}>
              <Text className="font-body-semibold text-base leading-6 text-white">Get started</Text>
            </Pressable>
          </Link>

          <Link href="/login" asChild>
            <Pressable accessibilityRole="button" className="active:opacity-85">
              <View className="rounded-full  p-[2px]">
                <View className="items-center rounded-full bg-transparent px-8 py-4">
                  <Text className="font-body-semibold text-base leading-6 text-gray-900">Log In</Text>
                </View>
              </View>
            </Pressable>
          </Link>
        </View>
      </View>
    </View>
  );
}
