import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImageWithPlaceholder } from '@/components/ui/image';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { useConfirm } from '@/lib/confirm';
import { useFeed } from '@/lib/feed-context';
import { fetchPostLikes, setFollowing as setFollowingRemote, type PostLiker } from '@/lib/posts';
import { timeAgo } from '@/lib/time';
import { useToast } from '@/lib/toast';
import { goBack } from '@/lib/navigation';

const AVATAR = 44;

/**
 * One person who liked the post, and the way to follow them back.
 *
 * The follow button is the reason this is more than a list of names: a like is
 * often the first thing you ever see somebody do, and having to leave for their
 * profile to act on it is a step for nothing. Written out here rather than
 * shared with the follows screen for the same reason `Stat` and `WinRow` are
 * written out on both profile screens — these rows drift apart by design, and a
 * shared one would have to grow a prop for every difference.
 */
function LikerRow({ person }: { person: PostLiker }) {
  const theme = useTheme();
  const { token, user } = useAuth();
  const { followState, setFollowed } = useFeed();
  const showToast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const isSelf = person.id === user?.id;
  /*
   * What this session settled, and only failing that what the row reported.
   *
   * The same person may be sitting in the feed behind this screen, and the two
   * must not disagree. It has to be `??` and not `||`: an unfollow is a `false`
   * here, and OR-ing it against a row that still says `is_following: true`
   * would keep the button reading Following after the tap.
   */
  const isFollowing = followState.get(person.id) ?? person.is_following;

  const toggle = async () => {
    if (!token || busy) return;

    const next = !isFollowing;

    // Asked on the way out only. Following is cheap to undo, and unfollowing is
    // the one people do by mistake — this button sits next to a row they meant
    // to open.
    if (!next) {
      const confirmed = await confirm({
        title: `Unfollow ${person.full_name}?`,
        message: 'Their wins will stop appearing in your feed.',
        confirmLabel: 'Unfollow',
        destructive: true,
      });
      if (!confirmed) return;
    }

    setBusy(true);
    setFollowed(person.id, next);
    try {
      const state = await setFollowingRemote(person.id, next, token);
      setFollowed(person.id, state.is_following);
    } catch (caught) {
      setFollowed(person.id, !next);
      showToast(caught instanceof Error ? caught.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-row items-center gap-3 px-4 py-2.5">
      {/* Opening the profile and following are siblings — a button inside a
          button is invalid on web and leaves two targets sharing one tap. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${person.full_name}'s profile`}
        onPress={() => router.push({ pathname: '/users/[userId]', params: { userId: person.id } })}
        className="flex-1 flex-row items-center gap-3 active:opacity-70">
        <ImageWithPlaceholder
          source={{ uri: person.avatar_url }}
          className="rounded-full"
          size={AVATAR}
          accessibilityLabel={`${person.full_name} profile photo`}>
          <View
            className="items-center justify-center rounded-full bg-primary"
            style={{ width: AVATAR, height: AVATAR }}>
            <Text className="font-heading-bold text-base leading-6 text-white">
              {(person.full_name.trim()[0] ?? '?').toUpperCase()}
            </Text>
          </View>
        </ImageWithPlaceholder>

        <View className="flex-1">
          <Text numberOfLines={1} className="font-body-semibold text-[15px] leading-5 text-ink">
            {person.full_name}
          </Text>
          <Text numberOfLines={1} className="font-sans text-[13px] leading-[18px] text-ink-muted">
            {/* `username` is nullable, and a bare "@" would read as a bug. */}
            {person.username ? `@${person.username}` : ''}
            {person.username && person.liked_at ? ' · ' : ''}
            {person.liked_at ? timeAgo(person.liked_at) : ''}
          </Text>
        </View>
      </Pressable>

      {/* Nothing to offer against your own row. */}
      {isSelf ? null : busy ? (
        <ActivityIndicator size="small" color={theme.textSecondary} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isFollowing ? `Unfollow ${person.full_name}` : `Follow ${person.full_name}`
          }
          accessibilityState={{ selected: isFollowing }}
          onPress={() => void toggle()}
          className={`min-w-[92px] items-center rounded-full px-4 py-2 active:opacity-85 ${
            isFollowing ? 'border border-hairline bg-surface-card' : ''
          }`}
          style={isFollowing ? undefined : { backgroundColor: theme.primary }}>
          <Text
            className="font-body-semibold text-[13px] leading-[18px]"
            style={{ color: isFollowing ? theme.text : theme.onPrimary }}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Who liked a post, most recent first.
 *
 * Reachable from the number beside the heart on any card — not from the heart
 * itself, which is still the like. Unlike a story's viewer list this is not the
 * author's alone: anybody who can read the post can see it was liked, so who
 * left the like is no more private than the count already was. The server
 * agrees, and answers 403 for a post this reader may not read at all.
 */
export default function PostLikesScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { token } = useAuth();

  const [people, setPeople] = useState<PostLiker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cursor = useRef<string | null>(null);
  const atEnd = useRef(false);
  const inFlight = useRef(false);
  // Set when a page fails, and what stops the list asking again on its own —
  // `onEndReached` re-fires for every new content length, and the footer
  // spinner changes the content length.
  const failed = useRef(false);

  const load = useCallback(
    async (reset: boolean) => {
      if (!token || !postId || inFlight.current) return;
      if (!reset && (atEnd.current || failed.current)) return;

      inFlight.current = true;
      try {
        const page = await fetchPostLikes(
          postId,
          token,
          reset ? undefined : (cursor.current ?? undefined)
        );

        cursor.current = page.meta.next_cursor;
        atEnd.current = page.meta.next_cursor === null;
        failed.current = false;
        setError(null);

        setPeople((previous) => {
          if (reset) return page.data;

          // A duplicate key is a hard error in a list, and a page racing a
          // reset can hand back somebody already seated.
          const seen = new Set(previous.map((person) => person.id));
          return previous.concat(page.data.filter((person) => !seen.has(person.id)));
        });
      } catch (caught) {
        failed.current = true;
        // This list is the whole point of the tap, so an empty one where the
        // answer should be would read as "nobody" — a different and wrong
        // answer.
        setError(caught instanceof Error ? caught.message : 'Could not load who liked this.');
      } finally {
        inFlight.current = false;
      }
    },
    [token, postId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load(true);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const loadMore = useCallback(async () => {
    if (atEnd.current || inFlight.current || failed.current) return;
    setLoadingMore(true);
    await load(false);
    setLoadingMore(false);
  }, [load]);

  return (
    <View className="flex-1 bg-surface">
      <View
        className="flex-row items-center gap-2 border-b border-hairline px-4 pb-3"
        style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => goBack()}
          hitSlop={8}
          className="-ml-2 p-2 active:opacity-60">
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={18}
            tintColor={theme.text}
          />
        </Pressable>
        <Text className="flex-1 font-heading-bold text-xl leading-7 text-ink">Likes</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={theme.textSecondary} />
        </View>
      ) : (
        <FlatList
          data={people}
          keyExtractor={(person) => person.id}
          renderItem={({ item }) => <LikerRow person={item} />}
          contentContainerClassName="w-full max-w-[800px] self-center"
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 16 }}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View className="items-center px-10 py-16">
              <Text className="text-center font-sans text-[15px] leading-[22px] text-ink-muted">
                {error ?? 'Nobody has liked this one yet.'}
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View className="py-4">
                <ActivityIndicator size="small" color={theme.textSecondary} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}
