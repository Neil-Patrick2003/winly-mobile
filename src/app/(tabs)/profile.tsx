import { Link, router, useFocusEffect } from 'expo-router';
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
import { ImageWithPlaceholder } from '@/components/ui/image';
import { Wordmark } from '@/components/wordmark';
import { BottomTabInset, Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { useFeed } from '@/lib/feed-context';
import { fetchUserPosts, humanizeMovementType, type Post, type Win } from '@/lib/posts';
import { timeAgo } from '@/lib/time';

/** The coral the destructive action is drawn in. */
const CORAL = '#E5484D';
const STREAK_ORANGE = '#E28F43';

/** One number under a word, in the row of three. */
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

/**
 * What a win says in one line.
 *
 * The person's own caption first, because it is what they chose to say about
 * it. Only where there is none does the win describe itself.
 */
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

/** A win in the list: what it was, when, and how it landed. */
function WinRow({ post }: { post: Post }) {
  const [win] = post.wins as (Win | undefined)[];
  const pillar = win ? PILLAR_THEME[win.type] : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${winTitle(post)}`}
      onPress={() =>
        router.push({ pathname: '/comments/[postId]', params: { postId: post.id } })
      }
      className="mx-4 mt-3 flex-row items-center gap-3 rounded-3xl bg-surface-card px-4 py-3.5 active:opacity-70">
      <View
        className="h-11 w-11 items-center justify-center rounded-2xl"
        style={{ backgroundColor: pillar?.tint ?? Colors.light.backgroundSelected }}>
        {pillar ? (
          <SymbolView name={pillar.icon} size={20} tintColor={pillar.accent} />
        ) : (
          <SymbolView
            name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
            size={20}
            tintColor={Colors.light.textSecondary}
          />
        )}
      </View>

      <View className="flex-1">
        <Text numberOfLines={1} className="font-body-semibold text-[15px] leading-5 text-ink">
          {winTitle(post)}
        </Text>
        <Text
          numberOfLines={1}
          className="mt-0.5 font-sans text-[13px] leading-[18px] text-ink-muted">
          {timeAgo(post.created_at)}
          {/* The first by name and the rest by count — a win shared with ten
              circles should not push its own title off the row. */}
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

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user, token, logout, isRestoring, refreshUser } = useAuth();
  const { adoptSavedState } = useFeed();
  const [loggingOut, setLoggingOut] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cursor = useRef<string | null>(null);
  const atEnd = useRef(false);
  const inFlight = useRef(false);
  const failed = useRef(false);

  const userId = user?.id;

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

  const reload = useCallback(async () => {
    atEnd.current = false;
    failed.current = false;
    cursor.current = null;
    await Promise.all([refreshUser(), loadPosts(true)]);
  }, [refreshUser, loadPosts]);

  // Sharing a win happens over this screen and moves both the counters and the
  // list, so coming back is the moment to ask again.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        await reload();
        if (!cancelled) setLoadingPosts(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [reload])
  );

  const handleLogout = async () => {
    setLoggingOut(true);
    // `logout` clears local state even if revoking the token fails, so this
    // always lands back on the welcome screen.
    await logout();
    router.replace('/');
  };

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

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
  const streak = user.streak_days;

  return (
    <View className="flex-1 bg-surface">
      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center"
        contentContainerStyle={{ paddingBottom: BottomTabInset + insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />
        }>
        {/* The cover runs up behind the status bar, and the avatar straddles its
            lower edge. */}
        <View
          className="bg-linear-to-r from-green-400 via-sky-400 to-violet-400"
          style={{ height: insets.top + 128 }}
        />

        <View className="-mt-12 flex-row items-end justify-between px-4">
          <View>
            {/* A ring of the page colour, so the avatar reads as sitting on the
                cover rather than punched out of it. */}
            <View className="rounded-full bg-surface p-1">
              <ImageWithPlaceholder
                source={{ uri: user.avatar_url }}
                className="h-24 w-24 rounded-full"
                accessibilityLabel={`${user.full_name} profile photo`}>
                <View className="h-24 w-24 items-center justify-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500">
                  <Text className="font-heading-bold text-4xl leading-[44px] text-white">
                    {initial}
                  </Text>
                </View>
              </ImageWithPlaceholder>
            </View>

            {user.has_active_story ? (
              <View className="absolute bottom-1 right-1 h-5 w-5 rounded-full border-2 border-surface bg-[#4ADE80]" />
            ) : null}
          </View>

          <View className="mb-1 flex-row items-center gap-2.5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
              onPress={() => router.push('/profile/edit')}
              className="rounded-full border border-hairline bg-surface-card px-4 py-2.5 active:opacity-70">
              <Text className="font-body-semibold text-[14px] leading-5 text-ink">
                Edit profile
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log out"
              accessibilityState={{ disabled: loggingOut, busy: loggingOut }}
              disabled={loggingOut}
              onPress={handleLogout}
              className={`rounded-full border bg-surface-card px-4 py-2.5 active:opacity-70 ${
                loggingOut ? 'opacity-50' : ''
              }`}
              style={{ borderColor: CORAL }}>
              <Text
                className="font-body-semibold text-[14px] leading-5"
                style={{ color: CORAL }}>
                {loggingOut ? 'Logging out…' : 'Log out'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View className="mt-4 px-4">
          <Text className="font-heading-bold text-2xl leading-8 text-ink">{user.full_name}</Text>
          <Text className="mt-0.5 font-sans text-[15px] leading-[21px] text-ink-muted">
            @{user.username}
          </Text>
          {user.bio ? (
            <Text className="mt-3 font-sans text-[15px] leading-[22px] text-ink">{user.bio}</Text>
          ) : null}
        </View>

        <View className="mx-4 mt-5 flex-row rounded-3xl bg-surface-card px-2">
          <Stat value={user.posts_count} label="Posts" />
          <View className="my-4 w-px bg-hairline" />
          <Stat
            value={user.followers_count}
            label="Followers"
            onPress={() =>
              router.push({
                pathname: '/users/[userId]/follows',
                params: { userId: user.id, tab: 'followers', name: user.username },
              })
            }
          />
          <View className="my-4 w-px bg-hairline" />
          <Stat
            value={user.following_count}
            label="Following"
            onPress={() =>
              router.push({
                pathname: '/users/[userId]/follows',
                params: { userId: user.id, tab: 'following', name: user.username },
              })
            }
          />
        </View>

        <View
          className="mx-4 mt-3 flex-row items-center gap-3 rounded-3xl px-4 py-3.5"
          style={{ backgroundColor: '#FDF2E3' }}>
          <Text className="text-2xl leading-8">🔥</Text>
          <View className="flex-1">
            <Text className="font-heading-bold text-base leading-6" style={{ color: STREAK_ORANGE }}>
              {streak === 1 ? '1-day streak' : `${streak}-day streak`}
            </Text>
            <Text numberOfLines={1} className="mt-0.5 font-sans text-[13px] leading-[18px] text-ink-muted">
              Longest: {user.longest_streak === 1 ? '1 day' : `${user.longest_streak} days`}
              {/* Encouragement only where there is something to keep going. */}
              {streak > 0 ? ' · Keep it going!' : ' · Start one today'}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log a win"
            onPress={() => router.push('/entry')}
            className="rounded-full px-4 py-2.5 active:opacity-85"
            style={{ backgroundColor: STREAK_ORANGE }}>
            <Text className="font-body-semibold text-[14px] leading-5 text-white">Log a win</Text>
          </Pressable>
        </View>

        {/* The shelf. On your own profile only, which is the whole of where it
            belongs: what you have kept is nobody else's business, so there is
            no matching row on anyone else's. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Saved posts"
          onPress={() => router.push('/saved')}
          className="mx-4 mt-3 flex-row items-center gap-3 rounded-3xl bg-surface-card px-4 py-3.5 active:opacity-70">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-surface-selected">
            <SymbolView
              name={{ ios: 'bookmark', android: 'bookmark_border', web: 'bookmark_border' }}
              size={20}
              tintColor={Colors.light.textSecondary}
            />
          </View>
          <View className="flex-1">
            <Text className="font-body-semibold text-[15px] leading-5 text-ink">Saved</Text>
            <Text numberOfLines={1} className="mt-0.5 font-sans text-[13px] leading-[18px] text-ink-muted">
              Wins you kept to come back to
            </Text>
          </View>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={14}
            tintColor={Colors.light.textSecondary}
          />
        </Pressable>

        {/* Only for admins, and only because the server says so — `is_admin`
            comes off the user record rather than being guessed at here. */}
        {user.is_admin ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/admin/meditations')}
            className="mx-4 mt-3 flex-row items-center gap-3 rounded-3xl bg-surface-card px-4 py-3.5 active:opacity-70">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-surface-selected">
              <SymbolView
                name={{ ios: 'gearshape.2', android: 'settings', web: 'settings' }}
                size={20}
                tintColor={Colors.light.textSecondary}
              />
            </View>
            <View className="flex-1">
              <Text className="font-body-semibold text-[15px] leading-5 text-ink">
                Manage meditations
              </Text>
              <Text numberOfLines={1} className="mt-0.5 font-sans text-[13px] leading-[18px] text-ink-muted">
                Admin · add categories &amp; guided sessions
              </Text>
            </View>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              size={14}
              tintColor={Colors.light.textSecondary}
            />
          </Pressable>
        ) : null}

        <Text className="mt-6 px-4 font-heading-bold text-lg leading-6 text-ink">My posts</Text>

        {loadingPosts && posts.length === 0 ? (
          <View className="items-center py-12">
            <ActivityIndicator size="small" color={Colors.light.textSecondary} />
          </View>
        ) : posts.length > 0 ? (
          posts.map((post) => <WinRow key={post.id} post={post} />)
        ) : (
          <View className="mx-4 mt-3 items-center gap-2 rounded-3xl bg-surface-card px-5 py-10">
            <Text className="text-center font-body-semibold text-base leading-6 text-ink">
              No posts yet
            </Text>
            <Text className="text-center font-sans text-sm leading-5 text-ink-muted">
              Everything you share shows up here.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
