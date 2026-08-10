import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PILLAR_THEME } from '@/components/entry-chrome';
import { ProfileAvatar } from '@/components/profile-avatar';
import { ProfileCover } from '@/components/profile-cover';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { useConfirm } from '@/lib/confirm';
import { useFeed } from '@/lib/feed-context';
import {
  fetchUserPosts,
  humanizeMovementType,
  setFollowing as setFollowingRemote,
  type Post,
  type Win,
} from '@/lib/posts';
import { fetchUserProfile, type PublicProfile } from '@/lib/profile';
import { timeAgo } from '@/lib/time';
import { useToast } from '@/lib/toast';
import { goBack } from '@/lib/navigation';

const STREAK_ORANGE = '#E28F43';
const CORAL = '#E5484D';

/**
 * One number under a word.
 *
 * Pressable only when given an `onPress` — the posts figure leads nowhere, and
 * a count that looks tappable but is not is worse than one that plainly is not.
 */
function Stat({
  value,
  label,
  onPress,
}: {
  value: number;
  label: string;
  onPress?: () => void;
}) {
  const body = (
    <>
      <Text className="font-heading-bold text-xl leading-7 text-ink">{value}</Text>
      <Text className="mt-0.5 font-sans text-[13px] leading-[18px] text-ink-muted">{label}</Text>
    </>
  );

  if (!onPress) return <View className="flex-1 items-center py-4">{body}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      onPress={onPress}
      className="flex-1 items-center py-4 active:opacity-60">
      {body}
    </Pressable>
  );
}

/** What a win says in one line — their caption first, then the win itself. */
function winTitle(post: Post) {
  const caption = post.caption?.trim();
  if (caption) return caption;

  const [win] = post.wins;
  if (!win) return 'Shared a win';

  switch (win.type) {
    case 'meditation':
      return `${win.duration_minutes} min meditation`;
    case 'learning':
      return win.learned_text.trim() || 'Something learned';
    case 'movement':
      return win.movement_type ? humanizeMovementType(win.movement_type) : 'Movement';
  }
}

function WinRow({ post }: { post: Post }) {
  const [win] = post.wins as (Win | undefined)[];
  const pillar = win ? PILLAR_THEME[win.type] : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${winTitle(post)}`}
      onPress={() => router.push({ pathname: '/comments/[postId]', params: { postId: post.id } })}
      className="mx-4 mt-3 flex-row items-center gap-3 rounded-3xl bg-surface-card px-4 py-3.5 active:opacity-70">
      <View
        className="h-11 w-11 items-center justify-center rounded-2xl"
        style={{ backgroundColor: pillar?.tint ?? Colors.light.backgroundSelected }}>
        <SymbolView
          name={pillar?.icon ?? { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
          size={20}
          tintColor={pillar?.accent ?? Colors.light.textSecondary}
        />
      </View>

      <View className="flex-1">
        <Text numberOfLines={1} className="font-body-semibold text-[15px] leading-5 text-ink">
          {winTitle(post)}
        </Text>
        <Text
          numberOfLines={1}
          className="mt-0.5 font-sans text-[13px] leading-[18px] text-ink-muted">
          {timeAgo(post.created_at)}
          {post.circles?.length
            ? ` · ${post.circles[0].name}${
                post.circles.length > 1 ? ` +${post.circles.length - 1}` : ''
              }`
            : ''}
        </Text>
      </View>

      <View className="flex-row items-center gap-1.5">
        <SymbolView
          name={
            post.viewer_has_liked
              ? { ios: 'heart.fill', android: 'favorite', web: 'favorite' }
              : { ios: 'heart', android: 'favorite_border', web: 'favorite_border' }
          }
          size={15}
          tintColor={post.viewer_has_liked ? CORAL : Colors.light.textSecondary}
        />
        <Text className="font-body-semibold text-[13px] leading-[18px] text-ink-muted">
          {post.likes_count}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Somebody else's profile.
 *
 * The same shape as your own, so arriving here from a post reads as the same
 * kind of place rather than a different screen about a person. What differs is
 * the pair of buttons: yours edits and signs out, theirs follows.
 */
export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { token } = useAuth();
  const { followState, setFollowed, adoptSavedState } = useFeed();
  const showToast = useToast();
  const confirm = useConfirm();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [following, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cursor = useRef<string | null>(null);
  const atEnd = useRef(false);
  const inFlight = useRef(false);
  const failed = useRef(false);

  const loadPosts = useCallback(
    async (reset: boolean) => {
      if (!token || !userId || inFlight.current) return;
      if (!reset && (atEnd.current || failed.current)) return;

      inFlight.current = true;
      try {
        const page = await fetchUserPosts(
          userId,
          token,
          reset ? undefined : (cursor.current ?? undefined)
        );

        cursor.current = page.meta.next_cursor;
        atEnd.current = page.meta.next_cursor === null;
        failed.current = false;

        setPosts((previous) => {
          if (reset) return page.data;

          const seen = new Set(previous.map((post) => post.id));
          return previous.concat(page.data.filter((post) => !seen.has(post.id)));
        });

        // Every row says whether it is on the shelf. Told to the one place the
        // cards read it from, or a post saved from the feed would draw an empty
        // bookmark here.
        adoptSavedState(page.data);
      } catch {
        failed.current = true;
      } finally {
        inFlight.current = false;
      }
    },
    [token, userId, adoptSavedState]
  );

  const load = useCallback(async () => {
    if (!token || !userId) return;

    atEnd.current = false;
    failed.current = false;
    cursor.current = null;

    try {
      const [found] = await Promise.all([fetchUserProfile(userId, token), loadPosts(true)]);
      setProfile(found);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load this profile.');
    }
  }, [token, userId, loadPosts]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        await load();
        if (!cancelled) setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  const loadMore = useCallback(async () => {
    if (atEnd.current || inFlight.current || failed.current) return;
    setLoadingMore(true);
    await loadPosts(false);
    setLoadingMore(false);
  }, [loadPosts]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  /*
   * What this session settled is read first, and the profile's own field only
   * where it has settled nothing.
   *
   * The same person's card may be sitting in the feed behind this screen, and
   * the two must not disagree — following here has to move the badge there. It
   * has to be `??` and not `||`: an unfollow is a `false`, and OR-ing it against
   * a profile still saying `is_following: true` left the badge on Following.
   */
  const isFollowing = profile ? (followState.get(profile.id) ?? profile.is_following ?? false) : false;

  const toggleFollow = useCallback(async () => {
    if (!token || !profile || following) return;

    const next = !isFollowing;

    // Asked on the way out only — see the same guard on the follows list.
    if (!next) {
      const confirmed = await confirm({
        title: `Unfollow ${profile.full_name}?`,
        message: 'Their wins will stop appearing in your feed.',
        confirmLabel: 'Unfollow',
        destructive: true,
      });
      if (!confirmed) return;
    }

    setBusy(true);
    setFollowed(profile.id, next);
    try {
      const state = await setFollowingRemote(profile.id, next, token);
      setFollowed(profile.id, state.is_following);
      setProfile((previous) =>
        previous
          ? {
              ...previous,
              is_following: state.is_following,
              followers_count: state.followers_count,
            }
          : previous
      );
      showToast(next ? `Following ${profile.username}` : `Unfollowed ${profile.username}`);
    } catch (caught) {
      setFollowed(profile.id, !next);
      showToast(caught instanceof Error ? caught.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  }, [confirm, token, profile, following, isFollowing, setFollowed, showToast]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="small" color={Colors.light.textSecondary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-surface px-10">
        <Text className="text-center font-sans text-[15px] leading-[22px] text-ink-muted">
          {error ?? 'That profile could not be found.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => goBack()}
          className="rounded-full bg-surface-selected px-5 py-2.5 active:opacity-70">
          <Text className="font-body-semibold text-[15px] leading-5 text-ink">Go back</Text>
        </Pressable>
      </View>
    );
  }

  const initial = (profile.full_name.trim()[0] ?? profile.username[0] ?? '?').toUpperCase();
  const streak = profile.streak_days;

  return (
    <View className="flex-1 bg-surface">
      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />
        }>
        <ProfileCover uri={profile.cover_url} height={insets.top + 128} />

        <View className="-mt-12 flex-row items-end justify-between px-4">
          <View>
            <ProfileAvatar uri={profile.avatar_url} name={profile.full_name} initial={initial} />
          </View>

          {/* Following reads as a state you can undo, not an invitation — so it
              is outlined where Follow is filled. Your own profile arrives here
              only by a stray link, and has nothing to offer but the way back. */}
          {profile.is_self ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isFollowing ? `Unfollow ${profile.username}` : `Follow ${profile.username}`}
              accessibilityState={{ busy: following, selected: isFollowing }}
              disabled={following}
              onPress={() => void toggleFollow()}
              className={`mb-1 min-w-[112px] items-center rounded-full px-5 py-2.5 active:opacity-85 ${
                isFollowing ? 'border border-hairline bg-surface-card' : ''
              }`}
              style={isFollowing ? undefined : { backgroundColor: theme.primary }}>
              {following ? (
                <ActivityIndicator
                  size="small"
                  color={isFollowing ? theme.textSecondary : theme.onPrimary}
                />
              ) : (
                <Text
                  className="font-body-semibold text-[14px] leading-5"
                  style={{ color: isFollowing ? theme.text : theme.onPrimary }}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
              )}
            </Pressable>
          )}
        </View>

        <View className="mt-4 px-4">
          <View className="flex-row items-center gap-2">
            <Text className="font-heading-bold text-2xl leading-8 text-ink">
              {profile.full_name}
            </Text>
            {profile.follows_you ? (
              <View className="rounded-full bg-surface-selected px-2 py-0.5">
                <Text className="font-body-semibold text-[11px] leading-4 text-ink-muted">
                  Follows you
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="mt-0.5 font-sans text-[15px] leading-[21px] text-ink-muted">
            @{profile.username}
          </Text>
          {profile.bio ? (
            <Text className="mt-3 font-sans text-[15px] leading-[22px] text-ink">{profile.bio}</Text>
          ) : null}
        </View>

        <View className="mx-4 mt-5 flex-row rounded-3xl bg-surface-card px-2">
          <Stat value={profile.posts_count} label="Posts" />
          <View className="my-4 w-px bg-hairline" />
          <Stat
            value={profile.followers_count}
            label="Followers"
            onPress={() =>
              router.push({
                pathname: '/users/[userId]/follows',
                params: { userId: profile.id, tab: 'followers', name: profile.username },
              })
            }
          />
          <View className="my-4 w-px bg-hairline" />
          <Stat
            value={profile.following_count}
            label="Following"
            onPress={() =>
              router.push({
                pathname: '/users/[userId]/follows',
                params: { userId: profile.id, tab: 'following', name: profile.username },
              })
            }
          />
        </View>

        {/* Only where there is a run to show. An orange card reading "0-day
            streak" on somebody else's profile is a judgement, not a fact. */}
        {streak > 0 ? (
          <View
            className="mx-4 mt-3 flex-row items-center gap-3 rounded-3xl px-4 py-3.5"
            style={{ backgroundColor: '#FDF2E3' }}>
            <Text className="text-2xl leading-8">🔥</Text>
            <View className="flex-1">
              <Text
                className="font-heading-bold text-base leading-6"
                style={{ color: STREAK_ORANGE }}>
                {streak === 1 ? '1-day streak' : `${streak}-day streak`}
              </Text>
              <Text className="mt-0.5 font-sans text-[13px] leading-[18px] text-ink-muted">
                Longest: {profile.longest_streak === 1 ? '1 day' : `${profile.longest_streak} days`}
              </Text>
            </View>
          </View>
        ) : null}

        <Text className="mt-6 px-4 font-heading-bold text-lg leading-6 text-ink">
          {profile.is_self ? 'My posts' : 'Their posts'}
        </Text>

        {posts.length > 0 ? (
          posts.map((post) => <WinRow key={post.id} post={post} />)
        ) : (
          <View className="mx-4 mt-3 items-center gap-2 rounded-3xl bg-surface-card px-5 py-10">
            <Text className="text-center font-body-semibold text-base leading-6 text-ink">
              Nothing shared yet
            </Text>
            <Text className="text-center font-sans text-sm leading-5 text-ink-muted">
              {profile.full_name.split(' ')[0]} has not posted yet.
            </Text>
          </View>
        )}

        {posts.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Load more wins"
            onPress={() => void loadMore()}
            disabled={loadingMore}
            className="items-center py-6 active:opacity-60">
            {loadingMore ? (
              <ActivityIndicator size="small" color={Colors.light.textSecondary} />
            ) : null}
          </Pressable>
        ) : null}
      </ScrollView>

      {/* Floated over the cover, white because it sits on the gradient. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => goBack()}
        hitSlop={8}
        className="absolute left-4 h-10 w-10 items-center justify-center rounded-full bg-black/15 active:opacity-60"
        style={{ top: insets.top + 4 }}>
        <SymbolView
          name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
          size={18}
          weight="bold"
          tintColor="#FFFFFF"
        />
      </Pressable>
    </View>
  );
}
