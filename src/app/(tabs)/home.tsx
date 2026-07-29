import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PostCard } from '@/components/post-card';
import { StoryRail } from '@/components/story-rail';
import { Image, ImageWithPlaceholder } from '@/components/ui/image';
import { ProgressRing } from '@/components/ui/progress-ring';
import { BottomTabInset, Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { FEED_TABS, TODAY_METRICS, type FeedTab } from '@/lib/home-data';
import { useFeed } from '@/lib/feed-context';

/** The green the home screen leans on: headings, buttons, the active tab. */
const GREEN = '#5FBC88';
const STREAK_ORANGE = '#E28F43';

/**
 * Time-of-day greeting, on the device's local clock.
 *
 * The small hours are handled explicitly: midnight to 05:00 is technically am,
 * but "Good morning" at 2am reads wrong.
 */
function greetingFor(hour: number) {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** A circular avatar that falls back to an initial when there is no photo. */
function Avatar({
  uri,
  name,
  size,
  className = '',
}: {
  uri: string | null;
  name: string;
  size: number;
  className?: string;
}) {
  return (
    <ImageWithPlaceholder
      source={{ uri }}
      className={`rounded-full ${className}`}
      accessibilityLabel={`${name} profile photo`}>
      <View
        className="items-center justify-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500"
        style={{ width: size, height: size }}>
        <Text
          className="font-heading-bold text-white"
          style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}>
          {(name.trim()[0] ?? '?').toUpperCase()}
        </Text>
      </View>
    </ImageWithPlaceholder>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [tab, setTab] = useState<FeedTab>('Following');
  const { posts, error, loading, loadingMore, refreshing, hasMore, refresh, loadMore } = useFeed();

  // Only the given name — the full display name reads oddly in a greeting.
  const firstName = user?.full_name.trim().split(' ')[0];
  const greeting = greetingFor(new Date().getHours());

  /**
   * Everything above the feed. It rides as the list header rather than wrapping
   * the list in a ScrollView, which would nest one scroller in another and cost
   * the feed its virtualisation and `onEndReached`.
   */
  const header = (
    <View>
      <View className="flex-row items-center gap-3 px-4">
        <View>
          <Avatar
            uri={user?.avatar_url ?? null}
            name={user?.full_name ?? '?'}
            size={56}
            className="h-14 w-14"
          />
          <View className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-surface bg-[#4ADE80]" />
        </View>

        <View className="flex-1">
          <Text className="font-heading-bold text-[17px] leading-[23px] text-ink">
            {firstName ? `${greeting}, ${firstName}!` : `${greeting}!`} ☀️
          </Text>
          <Text className="mt-0.5 font-sans text-[13px] leading-[18px] text-ink-muted">
            You&rsquo;ve got this. Let&rsquo;s grow together.
          </Text>
        </View>

        <View className="items-center rounded-2xl bg-surface-card px-3 py-2">
          <Text
            className="font-heading-bold text-[15px] leading-5"
            style={{ color: STREAK_ORANGE }}>
            🔥 {user?.streak_days ?? 0}
          </Text>
          <Text className="font-sans text-[11px] leading-4" style={{ color: STREAK_ORANGE }}>
            Day streak
          </Text>
        </View>
      </View>

      <StoryRail accent={GREEN} />

      <View className="mx-4 mt-5 flex-row overflow-hidden rounded-3xl bg-linear-to-br from-[#EBF6EF] to-[#F1FAF2]">
        <View className="flex-1 gap-1.5 py-4 pl-4">
          <View>
            <Text className="font-heading-bold text-[18px] leading-6 text-ink">
              Small steps today,
            </Text>
            <Text className="font-heading-bold text-[18px] leading-6" style={{ color: GREEN }}>
              big growth tomorrow.
            </Text>
          </View>
          <Text className="font-sans text-[13px] leading-[18px] text-ink-muted">
            Celebrate every win, no matter how small.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/entry')}
            className="mt-1 flex-row items-center gap-2 self-start rounded-full px-4 py-2.5 active:opacity-85"
            style={{ backgroundColor: GREEN }}>
            <Text className="font-body-semibold text-sm leading-5 text-white">Share a win</Text>
            <SymbolView
              name={{ ios: 'pencil', android: 'edit', web: 'edit' }}
              size={14}
              tintColor="#FFFFFF"
            />
          </Pressable>
        </View>

        <Image
          source={require('@/assets/images/illustrations/flower.png')}
          className="w-[38%] self-end"
          style={{ aspectRatio: 1 }}
          contentFit="contain"
        />
      </View>

      <View className="mx-4 mt-4 rounded-3xl bg-surface-card px-4 py-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-heading-bold text-lg leading-6 text-ink">Today&rsquo;s Progress</Text>
          <Pressable accessibilityRole="button" hitSlop={8} className="active:opacity-60">
            <Text className="font-body-semibold text-[15px] leading-5" style={{ color: GREEN }}>
              View all
            </Text>
          </Pressable>
        </View>

        {/* Five metrics never fit across a phone, so the row scrolls rather
            than squeezing the rings down to illegibility. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-4 mt-4 grow-0"
          contentContainerClassName="gap-4 px-4">
          {TODAY_METRICS.map((metric) => (
            <View key={metric.key} className="items-center gap-2">
              <ProgressRing progress={metric.progress} color={metric.color} size={66} thickness={5}>
                <SymbolView name={metric.icon} size={22} tintColor={metric.color} />
              </ProgressRing>
              <Text className="font-body-semibold text-[13px] leading-[18px] text-ink">
                {metric.label}
              </Text>
              <Text className="font-sans text-[12px] leading-4 text-ink-muted">
                {metric.value}
                {metric.progress >= 1 ? ' ✓' : ''}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>

    {/* The tabs are presentational for now: the feed endpoint takes only
        `per_page` and `cursor`, with no audience filter, so all three show
        the same posts. */}
    <View className="mx-4 mt-4 flex-row gap-5 rounded-3xl bg-surface-card px-4">
      {FEED_TABS.map((item) => {
        const active = item === tab;
        return (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => setTab(item)}
            className="py-4 active:opacity-70">
            <Text
              className={`text-base leading-6 ${
                active ? 'font-body-semibold' : 'font-sans text-ink-muted'
              }`}
              style={active ? { color: GREEN } : undefined}>
              {item}
            </Text>
            <View
              className="absolute inset-x-0 bottom-0 h-[3px] rounded-t-full"
              style={{ backgroundColor: active ? GREEN : 'transparent' }}
            />
          </Pressable>
        );
      })}
    </View>
    </View>
  );

  return (
    <View className="flex-1 bg-surface">
      <FlatList
        data={posts}
        keyExtractor={(post) => post.id}
        renderItem={({ item }) => <PostCard post={item} />}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        // A card can hold an open comment box. Without this the first tap on
        // Send only dismisses the keyboard and is swallowed, so posting a
        // comment from the feed takes two taps and looks broken.
        keyboardShouldPersistTaps="handled"
        // iOS only, and ignored elsewhere: insets the list by the keyboard so
        // the card being typed into is scrolled clear of it.
        automaticallyAdjustKeyboardInsets
        contentContainerClassName="w-full max-w-[800px] self-center"
        contentContainerStyle={{
          paddingTop: 12,
          paddingBottom: BottomTabInset + insets.bottom + 24,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={GREEN} />
        }
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={
          loading ? (
            <View className="items-center py-12">
              <ActivityIndicator size="small" color={Colors.light.textSecondary} />
            </View>
          ) : (
            <View className="mx-4 mt-3 items-center gap-2 rounded-3xl bg-surface-card px-5 py-10">
              <Text className="text-center font-body-semibold text-base leading-6 text-ink">
                {error ? 'Could not load the feed' : 'Nothing here yet'}
              </Text>
              <Text className="text-center font-sans text-sm leading-5 text-ink-muted">
                {error ?? 'Follow a few people, or share the first win yourself.'}
              </Text>
              {error ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void refresh()}
                  className="mt-2 rounded-full px-5 py-2.5 active:opacity-85"
                  style={{ backgroundColor: GREEN }}>
                  <Text className="font-body-semibold text-sm leading-5 text-white">Try again</Text>
                </Pressable>
              ) : null}
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View className="items-center py-6">
              <ActivityIndicator size="small" color={Colors.light.textSecondary} />
            </View>
          ) : posts.length > 0 && !hasMore ? (
            <Text className="py-6 text-center font-sans text-[13px] leading-[18px] text-ink-muted">
              You&rsquo;re all caught up
            </Text>
          ) : null
        }
      />
    </View>
  );
}
