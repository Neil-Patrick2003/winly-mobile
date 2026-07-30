import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PostCard } from '@/components/post-card';
import { StoryRail } from '@/components/story-rail';
import { ImageWithPlaceholder, Image } from '@/components/ui/image';
import { SegmentedRing } from '@/components/ui/segmented-ring';
import { BottomTabInset, Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useFeed } from '@/lib/feed-context';
import { FEED_KINDS, type FeedKind } from '@/lib/posts';
import { WIN_KINDS, type WeekProgress } from '@/lib/progress';
import { useWeekProgress } from '@/lib/use-week-progress';

/** The green the home screen leans on: headings, buttons, the active tab. */
const GREEN = '#5FBC88';
const STREAK_ORANGE = '#E28F43';

/**
 * What an empty feed means, which is not the same on each tab: nobody has
 * posted, nobody you follow has posted, or none of your circles has anything on
 * its wall. Each points at the thing that would actually fill it.
 */
const EMPTY_HINT: Record<FeedKind, string> = {
  all: 'Follow a few people, or share the first win yourself.',
  following: 'Nobody you follow has shared a win yet. Discover has people worth following.',
  circles: 'Nothing has been shared into your circles yet. Be the first.',
};

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

/**
 * This week, a ring per day.
 *
 * Each ring is broken into three dashes — meditation, learning, movement, in
 * that order — so a day says which kinds of win landed on it, not merely how
 * many. Seven fit across a phone without scrolling, which is the point of
 * showing the week rather than a scrolling row of invented daily metrics: the
 * whole week is one glance.
 */
function WeeklyProgress({
  week,
  loading,
  error,
}: {
  week: WeekProgress | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <View className="mx-4 mt-4 rounded-3xl bg-surface-card px-4 py-4">
      <View className="flex-row items-center justify-between">
        <Text className="font-heading-bold text-lg leading-6 text-ink">Weekly Progress</Text>
        <Text className="font-sans text-[13px] leading-[18px] text-ink-muted">This week</Text>
      </View>

      {loading && !week ? (
        <View className="items-center py-8">
          <ActivityIndicator size="small" color={Colors.light.textSecondary} />
        </View>
      ) : error && !week ? (
        // Said plainly rather than drawn as seven empty rings, which would
        // read as a week nothing was done in.
        <Text className="py-8 text-center font-sans text-[13px] leading-[18px] text-ink-muted">
          {error}
        </Text>
      ) : (
        <>
          <View className="mt-4 flex-row justify-between">
            {(week?.days ?? []).map((day) => (
              <View key={day.date} className="items-center gap-1.5">
                {/* The day names the ring it belongs to, so the row reads as
                    Mon–Sun without a separate header line to match up
                    against. Today is in full ink and a day still to come is
                    dimmed: the week reads as in progress rather than as half
                    missed. */}
                <SegmentedRing
                  size={40}
                  thickness={3}
                  segments={WIN_KINDS.map((kind) => ({
                    key: kind.key,
                    color: kind.color,
                    done: day[kind.key],
                  }))}>
                  <Text
                    className={`text-[10px] leading-[14px] ${
                      day.is_today
                        ? 'font-body-semibold text-ink'
                        : day.is_future
                          ? 'font-sans text-ink-muted opacity-50'
                          : 'font-sans text-ink-muted'
                    }`}>
                    {day.weekday}
                  </Text>
                </SegmentedRing>

                <Text
                  className={`text-[11px] leading-4 ${
                    day.is_today ? 'font-body-semibold text-ink' : 'font-sans text-ink-muted'
                  } ${day.is_future ? 'opacity-50' : ''}`}>
                  {day.day_of_month}
                </Text>
              </View>
            ))}
          </View>

          {/* Without this the three dashes are decoration. */}
          <View className="mt-4 flex-row flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-3">
            {WIN_KINDS.map((kind) => (
              <View key={kind.key} className="flex-row items-center gap-1.5">
                <View
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: kind.color }}
                />
                <Text className="font-sans text-[12px] leading-4 text-ink-muted">{kind.label}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { posts, error, loading, loadingMore, refreshing, hasMore, refresh, loadMore, kind, setKind } =
    useFeed();
  const {
    week,
    loading: weekLoading,
    error: weekError,
    refresh: refreshWeek,
  } = useWeekProgress();

  // Only the given name — the full display name reads oddly in a greeting.
  const firstName = user?.full_name.trim().split(' ')[0];
  const greeting = greetingFor(new Date().getHours());

  /**
   * The streak, preferring the signed-in user's over the week's copy.
   *
   * Both are the same server-computed number — the run still standing rather
   * than the stored column — so this is only ever a question of which is
   * fresher. The user record wins because more things refresh it: sharing a win
   * calls `refreshUser` directly, and the story rail calls it again on focus.
   * The week's copy is the fallback for the first paint, before either has
   * landed.
   */
  const streak = user?.streak_days ?? week?.streak_days ?? 0;

  // One pull refreshes both — the week sits inside the list header, so a feed
  // that reloaded while the card above it did not would look broken.
  const refreshAll = useCallback(async () => {
    await Promise.all([refresh(), refreshWeek()]);
  }, [refresh, refreshWeek]);

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
            🔥 {streak}
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

      <WeeklyProgress week={week} loading={weekLoading} error={weekError} />

      {/* The head of the feed's card: the filter sits on top of the posts
          rather than floating above them, so the whole newsfeed reads as one
          surface. Rounded at the top only — the list continues it, and the
          footer closes it off.

          Each tab is a real query now: For You is everything, Following is the
          people you chose, and Circles is what has been shared into circles you
          are in. One post can be in all three, which is expected — they are
          three ways of arriving at the feed, not three audiences. */}
      <View className="mx-4 mt-4 flex-row gap-5 rounded-t-3xl bg-surface-card px-4">
        {FEED_KINDS.map((item) => {
          const active = item.key === kind;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setKind(item.key)}
              className="py-4 active:opacity-70">
              <Text
                className={`text-base leading-6 ${
                  active ? 'font-body-semibold' : 'font-sans text-ink-muted'
                }`}
                style={active ? { color: GREEN } : undefined}>
                {item.label}
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
        // Inside the card the filter opened, not floating on the page: the
        // post keeps its own padding, and this only supplies the card's edges
        // and fill. The margin has to live here rather than in `PostCard`,
        // which is also drawn full-bleed on a circle's wall and on the post's
        // own screen.
        renderItem={({ item }) => (
          <View className="mx-4 bg-surface-card">
            <PostCard post={item} />
          </View>
        )}
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
          <RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={GREEN} />
        }
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={
          loading ? (
            <View className="mx-4 items-center rounded-b-3xl bg-surface-card py-12">
              <ActivityIndicator size="small" color={Colors.light.textSecondary} />
            </View>
          ) : (
            <View className="mx-4 items-center gap-2 rounded-b-3xl bg-surface-card px-5 py-10">
              <Text className="text-center font-body-semibold text-base leading-6 text-ink">
                {error ? 'Could not load the feed' : 'Nothing here yet'}
              </Text>
              {/* Empty means a different thing on each tab now, and the
                  generic line sent people to follow somebody they may already
                  follow plenty of. */}
              <Text className="text-center font-sans text-sm leading-5 text-ink-muted">
                {error ?? EMPTY_HINT[kind]}
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
        // Closes the card off, whatever it has to say — including when it has
        // nothing, since an unrounded bottom edge would leave the feed looking
        // cut off rather than finished.
        ListFooterComponent={
          posts.length === 0 ? null : (
            <View className="mx-4 rounded-b-3xl bg-surface-card">
              {loadingMore ? (
                <View className="items-center py-6">
                  <ActivityIndicator size="small" color={Colors.light.textSecondary} />
                </View>
              ) : !hasMore ? (
                <Text className="py-6 text-center font-sans text-[13px] leading-[18px] text-ink-muted">
                  You&rsquo;re all caught up
                </Text>
              ) : (
                <View className="h-4" />
              )}
            </View>
          )
        }
      />
    </View>
  );
}
