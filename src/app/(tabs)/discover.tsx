import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { CircleBadge } from '@/components/circle-badge';
import { CircleName, circleLabel } from '@/components/circle-name';
import { ImageWithPlaceholder } from '@/components/ui/image';
import { BottomTabInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { joinCircle, type Circle } from '@/lib/circles';
import { fetchDiscover, type Discover, type SuggestedPerson } from '@/lib/discover';
import { useConfirm } from '@/lib/confirm';
import { useFeed } from '@/lib/feed-context';
import { setFollowing as setFollowingRemote } from '@/lib/posts';
import { useToast } from '@/lib/toast';

/** Stands for "no tag", so the chip row has something to select. */
const ALL = '__all__';

/** How long to sit on a keystroke before asking the server. */
const SEARCH_DEBOUNCE_MS = 350;

function SectionTitle({ children }: { children: string }) {
  return <Text className="mt-6 px-4 font-heading-bold text-lg leading-6 text-ink">{children}</Text>;
}

/** A circle, with the way in beside it. */
function CircleRow({ circle, onJoined }: { circle: Circle; onJoined: (id: string) => void }) {
  const theme = useTheme();
  const { token } = useAuth();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);

  const join = async () => {
    if (!token || busy) return;

    setBusy(true);
    try {
      await joinCircle(circle.id, token);
      onJoined(circle.id);
      showToast(`Joined ${circleLabel(circle)} 🌱`);
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'Could not join that circle.');
    } finally {
      setBusy(false);
    }
  };

  /*
   * Opening the circle and joining it are siblings rather than one button
   * inside the other: nesting them is invalid on web, and left two overlapping
   * targets arguing over the same tap. The row is a plain container; the part
   * that opens the circle is everything up to the Join button.
   */
  return (
    <View className="mx-4 mt-3 flex-row items-center gap-3 rounded-3xl bg-surface-card px-4 py-3.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${circleLabel(circle)}`}
        onPress={() =>
          router.push({ pathname: '/circles/[circleId]', params: { circleId: circle.id } })
        }
        className="flex-1 flex-row items-center gap-3 active:opacity-70">
        <CircleBadge initial={circle.icon_initial} color={circle.color_hex} />

        <View className="flex-1">
          <CircleName
            circle={circle}
            numberOfLines={1}
            className="font-body-semibold text-base leading-6 text-ink"
          />
          <Text
            numberOfLines={1}
            className="mt-0.5 font-sans text-[13px] leading-[18px] text-ink-muted">
            {circle.members_count === 1 ? '1 member' : `${circle.members_count} members`}
            {circle.tag ? ` · ${circle.tag}` : ''}
          </Text>
        </View>
      </Pressable>

      {/* Already in reads as a state, not a button — there is nothing to do. */}
      {circle.is_member ? (
        <View
          className="flex-row items-center gap-1.5 rounded-full border px-3.5 py-2"
          style={{ borderColor: theme.primary }}>
          <Text
            className="font-body-semibold text-[13px] leading-[18px]"
            style={{ color: theme.primary }}>
            Joined
          </Text>
          <SymbolView
            name={{ ios: 'checkmark', android: 'check', web: 'check' }}
            size={11}
            weight="bold"
            tintColor={theme.primary}
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Join ${circleLabel(circle)}`}
          accessibilityState={{ busy }}
          disabled={busy}
          onPress={() => void join()}
          className="min-w-[76px] items-center rounded-full px-4 py-2 active:opacity-85"
          style={{ backgroundColor: theme.primary }}>
          {busy ? (
            <ActivityIndicator size="small" color={theme.onPrimary} />
          ) : (
            <Text
              className="font-body-semibold text-[13px] leading-[18px]"
              style={{ color: theme.onPrimary }}>
              Join
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

/** Somebody to follow, and why. */
function PersonRow({
  person,
  onFollowed,
}: {
  person: SuggestedPerson;
  /**
   * Called once they have been followed, for the caller to retire the row.
   *
   * Absent while searching, where the row stays put and turns into "Following"
   * — a search result is a person you went looking for, not a suggestion that
   * has been spent.
   */
  onFollowed?: (id: string) => void;
}) {
  const theme = useTheme();
  const { token } = useAuth();
  const { followState, setFollowed } = useFeed();
  const showToast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  /*
   * This session's answer first, the payload's second.
   *
   * `??` and not `||`: an unfollow is a `false` here, and OR-ing it against a
   * row still carrying `is_following: true` would keep the badge on Following
   * and make the tap look ignored.
   */
  const isFollowing = followState.get(person.id) ?? person.is_following;

  const toggle = async () => {
    if (!token || busy) return;

    const next = !isFollowing;

    // Only on the way out, as everywhere else: following is cheap to undo, and
    // unfollowing is the one people do by mistake.
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
      /*
       * Said out loud, and not only to the server.
       *
       * A suggestion here is somebody the feed may already be showing a card
       * for, and a card the reader scrolled past put a `false` against them.
       * Following without recording it left that `false` standing as the last
       * word this session had, so the person turned up on your own Following
       * list still offering a Follow button.
       */
      setFollowed(person.id, state.is_following);

      if (state.is_following) {
        onFollowed?.(person.id);
        showToast(`Following ${person.username ?? person.full_name}`);
      }
    } catch (caught) {
      setFollowed(person.id, !next);
      showToast(caught instanceof Error ? caught.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  };

  const posts = person.posts_count === 1 ? '1 post' : `${person.posts_count} posts`;

  return (
    <View className="mx-4 mt-3 flex-row items-center gap-3 rounded-3xl bg-surface-card px-4 py-3.5">
      {/* Opening the profile and following are siblings: a button inside a
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
        className="h-11 w-11 rounded-full"
        accessibilityLabel={`${person.full_name} profile photo`}>
        <View className="h-11 w-11 items-center justify-center rounded-full bg-primary">
          <Text className="font-heading-bold text-base leading-6 text-white">
            {(person.full_name.trim()[0] ?? '?').toUpperCase()}
          </Text>
        </View>
      </ImageWithPlaceholder>

      <View className="flex-1">
        <Text numberOfLines={1} className="font-body-semibold text-base leading-6 text-ink">
          {person.full_name}
        </Text>
        <Text
          numberOfLines={1}
          className="mt-0.5 font-sans text-[13px] leading-[18px] text-ink-muted">
          {posts}
          {/* A streak of nothing is not a fact worth stating. */}
          {person.streak_days > 0 ? ` · ${person.streak_days} day streak` : ''}
        </Text>
      </View>
      </Pressable>

      {/* Searching can turn up somebody you already follow, so the button has
          to be able to say so — it used to read "Follow" whatever the truth
          was, because the list could only ever contain people you did not. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          isFollowing ? `Unfollow ${person.full_name}` : `Follow ${person.full_name}`
        }
        accessibilityState={{ busy, selected: isFollowing }}
        disabled={busy}
        onPress={() => void toggle()}
        className={`min-w-[86px] items-center rounded-full px-4 py-2.5 active:opacity-85 ${
          isFollowing ? 'border border-hairline bg-surface-card' : ''
        }`}
        style={isFollowing ? undefined : { backgroundColor: theme.text }}>
        {busy ? (
          <ActivityIndicator
            size="small"
            color={isFollowing ? theme.textSecondary : theme.background}
          />
        ) : (
          <Text
            className="font-body-semibold text-[13px] leading-[18px]"
            style={{ color: isFollowing ? theme.text : theme.background }}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

/**
 * Discover: circles worth joining and people worth following.
 *
 * Both lists are short and unpaginated by design — a shop window rather than a
 * catalogue. Anyone looking for something in particular uses the search box,
 * which asks the server rather than sifting whatever happens to be on screen.
 */
export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const muted = useResolveClassNames('text-ink-muted').color;
  const { token } = useAuth();

  const [data, setData] = useState<Discover | null>(null);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string>(ALL);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which request is the newest. A slow answer to an old search must not
  // overwrite the results of a newer one.
  const ticket = useRef(0);

  const load = useCallback(
    async (search: string, chosenTag: string) => {
      if (!token) return;

      const mine = ++ticket.current;
      try {
        const next = await fetchDiscover(token, {
          q: search,
          tag: chosenTag === ALL ? undefined : chosenTag,
        });
        if (ticket.current !== mine) return;

        setData(next);
        setError(null);
      } catch (caught) {
        if (ticket.current !== mine) return;
        setError(caught instanceof Error ? caught.message : 'Could not load Discover.');
      }
    },
    [token]
  );

  // Debounced, so typing a word is one request rather than one per letter.
  // Unfiltered loads go straight through: there is nothing to wait for.
  useEffect(() => {
    const timer = setTimeout(
      () => {
        void (async () => {
          await load(query, tag);
          setLoading(false);
        })();
      },
      query ? SEARCH_DEBOUNCE_MS : 0
    );

    return () => clearTimeout(timer);
  }, [load, query, tag]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(query, tag);
    setRefreshing(false);
  }, [load, query, tag]);

  /** Mark a circle joined in place, so the row settles without a refetch. */
  const markJoined = useCallback((circleId: string) => {
    setData((previous) =>
      previous
        ? {
            ...previous,
            circles: previous.circles.map((circle) =>
              circle.id === circleId
                ? { ...circle, is_member: true, members_count: circle.members_count + 1 }
                : circle
            ),
          }
        : previous
    );
  }, []);

  /**
   * Drop somebody from the suggestions once followed.
   *
   * The list is people you do *not* follow, so leaving them sitting there under
   * a spent button would contradict the heading above them.
   */
  const markFollowed = useCallback((personId: string) => {
    setData((previous) =>
      previous
        ? { ...previous, people: previous.people.filter((person) => person.id !== personId) }
        : previous
    );
  }, []);

  const tags = data?.tags ?? [];
  const circles = data?.circles ?? [];
  const people = data?.people ?? [];
  const searching = query.trim().length > 0;

  return (
    <View className="flex-1 bg-surface">
      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center"
        contentContainerStyle={{
          paddingTop: 4,
          paddingBottom: BottomTabInset + insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />
        }>
        <Text className="px-4 font-heading-bold text-3xl leading-10 text-ink">Discover</Text>

        <View className="mx-4 mt-4 flex-row items-center gap-2.5 rounded-2xl bg-surface-card px-4 py-3.5">
          <SymbolView
            name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
            size={17}
            tintColor={theme.textSecondary}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search circles, people, topics…"
            placeholderTextColor={muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search circles and people"
            className="flex-1 p-0 font-sans text-[15px] leading-[22px] text-ink"
          />
          {searching ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery('')}
              hitSlop={8}
              className="active:opacity-60">
              <SymbolView
                name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
                size={16}
                tintColor={theme.textSecondary}
              />
            </Pressable>
          ) : null}
        </View>

        {tags.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-4 grow-0"
            contentContainerClassName="gap-2 px-4">
            {[ALL, ...tags].map((item) => {
              const active = item === tag;

              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setTag(item)}
                  className={`rounded-full border px-4 py-2.5 active:opacity-70 ${
                    active ? 'border-transparent' : 'border-hairline bg-surface-card'
                  }`}
                  style={active ? { backgroundColor: theme.text } : undefined}>
                  <Text
                    className="font-body-semibold text-[14px] leading-5"
                    style={{ color: active ? theme.background : theme.text }}>
                    {item === ALL ? 'All' : item}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {loading ? (
          <View className="items-center py-16">
            <ActivityIndicator size="small" color={theme.textSecondary} />
          </View>
        ) : error ? (
          <View className="mx-4 mt-6 items-center gap-2 rounded-3xl bg-surface-card px-5 py-10">
            <Text className="text-center font-body-semibold text-base leading-6 text-ink">
              Could not load Discover
            </Text>
            <Text className="text-center font-sans text-sm leading-5 text-ink-muted">{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void refresh()}
              className="mt-2 rounded-full px-5 py-2.5 active:opacity-85"
              style={{ backgroundColor: theme.primary }}>
              <Text
                className="font-body-semibold text-sm leading-5"
                style={{ color: theme.onPrimary }}>
                Try again
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <SectionTitle>{searching ? 'Circles' : 'Trending circles'}</SectionTitle>
            {circles.length > 0 ? (
              circles.map((circle) => (
                <CircleRow key={circle.id} circle={circle} onJoined={markJoined} />
              ))
            ) : (
              <Text className="mx-4 mt-3 rounded-3xl bg-surface-card px-4 py-6 text-center font-sans text-sm leading-5 text-ink-muted">
                {searching ? 'No circles match that.' : 'No circles yet. Start the first one.'}
              </Text>
            )}

            <SectionTitle>People to follow</SectionTitle>
            {people.length > 0 ? (
              people.map((person) => (
                /* Retired from the list once followed while browsing — the
                   suggestion is spent. A search result stays, and turns into
                   "Following" instead, because it is the person you came for. */
                <PersonRow
                  key={person.id}
                  person={person}
                  onFollowed={searching ? undefined : markFollowed}
                />
              ))
            ) : (
              <Text className="mx-4 mt-3 rounded-3xl bg-surface-card px-4 py-6 text-center font-sans text-sm leading-5 text-ink-muted">
                {searching
                  ? 'Nobody matches that.'
                  : 'Nobody to suggest yet — you already follow everyone who posts.'}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
