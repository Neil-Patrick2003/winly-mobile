import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImageWithPlaceholder } from '@/components/ui/image';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { useFeed } from '@/lib/feed-context';
import { setFollowing as setFollowingRemote } from '@/lib/posts';
import { fetchFollows, type UserSummary } from '@/lib/stories';
import { useToast } from '@/lib/toast';
import { goBack } from '@/lib/navigation';

const AVATAR = 44;

type Relation = 'followers' | 'following';

const TABS: { key: Relation; label: string }[] = [
  { key: 'followers', label: 'Followers' },
  { key: 'following', label: 'Following' },
];

/** One person, with the way to follow them back. */
function PersonRow({ person }: { person: UserSummary }) {
  const theme = useTheme();
  const { token, user } = useAuth();
  const { followState, setFollowed } = useFeed();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);

  const isSelf = person.id === user?.id;
  /*
   * What this session settled, and only failing that what the page reported.
   *
   * The same person can appear on both tabs and in the feed behind this screen;
   * following them in one place has to move every other. It has to be `??` and
   * not `||`: an unfollow is a `false` here, and OR-ing it against a payload
   * that still says `is_following: true` — as the row it was loaded with always
   * will — kept the badge on Following and made the tap look ignored.
   */
  const isFollowing = followState.get(person.id) ?? person.is_following;

  const toggle = async () => {
    if (!token || busy) return;

    const next = !isFollowing;
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
        onPress={() =>
          router.push({ pathname: '/users/[userId]', params: { userId: person.id } })
        }
        className="flex-1 flex-row items-center gap-3 active:opacity-70">
        <ImageWithPlaceholder
          source={{ uri: person.avatar_url }}
          className="rounded-full"
          size={AVATAR}
          accessibilityLabel={`${person.full_name} profile photo`}>
          <View
            className="items-center justify-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500"
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
          {person.username ? (
            <Text numberOfLines={1} className="font-sans text-[13px] leading-[18px] text-ink-muted">
              @{person.username}
            </Text>
          ) : null}
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
 * Who follows somebody, and who they follow.
 *
 * One screen with two tabs rather than two routes: the pair is read by
 * switching between them, and a separate screen each would mean going back to
 * go across. The tab tapped on the profile is the one it opens on.
 *
 * Each side keeps its own cursor, so switching tabs does not lose your place on
 * the one you left.
 */
export default function FollowsScreen() {
  const { userId, tab, name } = useLocalSearchParams<{
    userId: string;
    tab?: Relation;
    name?: string;
  }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { token } = useAuth();

  const [relation, setRelation] = useState<Relation>(tab === 'following' ? 'following' : 'followers');
  const [people, setPeople] = useState<Record<Relation, UserSummary[]>>({
    followers: [],
    following: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * A cursor per tab, not one shared.
   *
   * The two lists page independently — asking the followers endpoint for a
   * cursor the following endpoint handed out would skip or repeat rows.
   */
  const cursors = useRef<Record<Relation, string | null>>({ followers: null, following: null });
  const atEnd = useRef<Record<Relation, boolean>>({ followers: false, following: false });
  const loaded = useRef<Record<Relation, boolean>>({ followers: false, following: false });
  const inFlight = useRef(false);
  // A failed page must not be retried on its own: `onEndReached` re-fires for
  // every new content length, and the footer spinner changes it.
  const failed = useRef(false);

  const load = useCallback(
    async (which: Relation, reset: boolean) => {
      if (!token || !userId || inFlight.current) return;
      if (!reset && (atEnd.current[which] || failed.current)) return;

      inFlight.current = true;
      try {
        const page = await fetchFollows(
          userId,
          which,
          token,
          reset ? undefined : (cursors.current[which] ?? undefined)
        );

        cursors.current[which] = page.meta.next_cursor;
        atEnd.current[which] = page.meta.next_cursor === null;
        loaded.current[which] = true;
        failed.current = false;
        setError(null);

        setPeople((previous) => {
          if (reset) return { ...previous, [which]: page.data };

          // A duplicate key is a hard error in a list, and a page racing a
          // reset can hand back somebody already seated.
          const seen = new Set(previous[which].map((person) => person.id));
          return {
            ...previous,
            [which]: previous[which].concat(page.data.filter((p) => !seen.has(p.id))),
          };
        });
      } catch (caught) {
        failed.current = true;
        setError(caught instanceof Error ? caught.message : 'Could not load that list.');
      } finally {
        inFlight.current = false;
      }
    },
    [token, userId]
  );

  // Each tab is fetched the first time it is looked at, and not again — the
  // one you came back to still holds everything it had paged in.
  useEffect(() => {
    if (loaded.current[relation]) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      failed.current = false;
      await load(relation, true);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [relation, load]);

  const loadMore = useCallback(async () => {
    if (atEnd.current[relation] || inFlight.current || failed.current) return;
    setLoadingMore(true);
    await load(relation, false);
    setLoadingMore(false);
  }, [load, relation]);

  const rows = people[relation];

  return (
    <View className="flex-1 bg-surface">
      <View
        className="flex-row items-center gap-2 px-4 pb-2"
        style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => goBack({ pathname: '/users/[userId]', params: { userId } })}
          hitSlop={8}
          className="-ml-2 p-2 active:opacity-60">
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={18}
            tintColor={theme.text}
          />
        </Pressable>
        <Text numberOfLines={1} className="flex-1 font-heading-bold text-xl leading-7 text-ink">
          {name ? `@${name}` : 'People'}
        </Text>
      </View>

      <View className="flex-row border-b border-hairline px-4">
        {TABS.map((item) => {
          const active = item.key === relation;

          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setRelation(item.key)}
              className="flex-1 items-center py-3 active:opacity-70">
              <Text
                className={`text-[15px] leading-5 ${
                  active ? 'font-body-semibold' : 'font-sans text-ink-muted'
                }`}
                style={active ? { color: theme.primary } : undefined}>
                {item.label}
              </Text>
              <View
                className="absolute inset-x-0 bottom-0 h-[2px] rounded-t-full"
                style={{ backgroundColor: active ? theme.primary : 'transparent' }}
              />
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={theme.textSecondary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(person) => person.id}
          renderItem={({ item }) => <PersonRow person={item} />}
          contentContainerClassName="w-full max-w-[800px] self-center"
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 24 }}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View className="items-center px-10 py-16">
              <Text className="text-center font-sans text-[15px] leading-[22px] text-ink-muted">
                {error ??
                  (relation === 'followers'
                    ? 'Nobody is following yet.'
                    : 'Not following anyone yet.')}
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
