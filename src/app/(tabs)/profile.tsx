import { Link, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeartDivider } from '@/components/heart';
import { ImageWithPlaceholder } from '@/components/ui/image';
import { Wordmark } from '@/components/wordmark';
import { BottomTabInset, Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

/** A labelled row of account detail. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-4 py-3">
      <Text className="font-sans text-sm leading-5 text-ink-muted">{label}</Text>
      <Text className="flex-1 text-right font-body-semibold text-sm leading-5 text-ink">
        {value}
      </Text>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, isRestoring } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    // `logout` clears local state even if revoking the token fails, so this
    // always lands back on the welcome screen.
    await logout();
    router.replace('/');
  };

  // Reading the stored token is async, so hold the screen rather than flashing
  // the signed-out state at someone who is about to be signed in.
  if (isRestoring) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="small" color={Colors.light.textSecondary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-surface px-4">
        <Wordmark />
        <Text className="text-center font-sans text-sm leading-5 text-ink-muted">
          You are not signed in.
        </Text>
        <Link href="/login" replace asChild>
          <Pressable
            accessibilityRole="button"
            className="items-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500 px-8 py-3 active:opacity-85">
            <Text className="font-body-semibold text-base leading-6 text-white">Log In</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  const initial = (user.full_name.trim()[0] ?? user.username[0] ?? '?').toUpperCase();
  const joined = new Date(user.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <View className="flex-1 bg-surface">
      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center px-4"
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: BottomTabInset + insets.bottom + 24,
        }}>
        <View className="items-center gap-2">
          <Wordmark />
          <HeartDivider />
        </View>

        <View className="items-center gap-3 pt-8">
          <ImageWithPlaceholder
            source={{ uri: user.avatar_url }}
            className="h-20 w-20 rounded-full"
            accessibilityLabel={`${user.full_name} profile photo`}>
            {/* No avatar, or one that would not load — for a person the initial
                on the brand sweep beats a generic glyph. */}
            <View className="h-20 w-20 items-center justify-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500">
              <Text className="font-heading-bold text-3xl leading-10 text-white">{initial}</Text>
            </View>
          </ImageWithPlaceholder>

          <View className="items-center gap-0.5">
            <Text className="font-heading-bold text-2xl leading-8 text-ink">{user.full_name}</Text>
            <Text className="font-sans text-sm leading-5 text-ink-muted">@{user.username}</Text>
          </View>

          {user.bio ? (
            <Text className="text-center font-sans text-sm leading-5 text-ink-muted">
              {user.bio}
            </Text>
          ) : null}
        </View>

        <View className="mt-8 rounded-2xl border border-hairline bg-surface-card px-4 py-1">
          <Row label="Email" value={user.email} />
          <View className="h-px bg-hairline" />
          <Row label="Account" value={user.is_private ? 'Private' : 'Public'} />
          <View className="h-px bg-hairline" />
          <Row label="Joined" value={joined} />
        </View>

        {/* Nothing in the API gates on verification yet, so this is a nudge
            rather than a blocker. */}
        {user.email_verified_at === null ? (
          <View className="mt-3 flex-row items-start gap-2 rounded-2xl border border-hairline bg-surface-card p-4">
            <SymbolView
              name={{ ios: 'envelope.badge', android: 'mark_email_unread', web: 'mark_email_unread' }}
              size={16}
              tintColor={Colors.light.textSecondary}
            />
            <Text className="flex-1 font-sans text-xs leading-4 text-ink-muted">
              We sent a verification link to your email. You can keep using Winly in the meantime.
            </Text>
          </View>
        ) : null}

        {/* Settings lost its header slot to messages, so this is now the only
            way in. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings')}
          className="mt-3 flex-row items-center gap-3 rounded-2xl border border-hairline bg-surface-card px-4 py-3.5 active:opacity-70">
          <SymbolView
            name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
            size={18}
            tintColor={Colors.light.textSecondary}
          />
          <Text className="flex-1 font-body-semibold text-[15px] leading-5 text-ink">Settings</Text>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={14}
            tintColor={Colors.light.textSecondary}
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: loggingOut }}
          disabled={loggingOut}
          onPress={handleLogout}
          className={`mt-8 items-center rounded-full border border-hairline py-3.5 active:opacity-70 ${
            loggingOut ? 'opacity-40' : ''
          }`}>
          <View className="flex-row items-center gap-2">
            {loggingOut ? <ActivityIndicator size="small" color={Colors.light.textSecondary} /> : null}
            <Text className="font-body-semibold text-base leading-6 text-ink-muted">
              {loggingOut ? 'Logging out…' : 'Log out'}
            </Text>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}
