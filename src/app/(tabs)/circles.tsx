import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CircleBadge } from '@/components/circle-badge';
import { CircleName, circleLabel } from '@/components/circle-name';
import { BottomTabInset, Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { fetchCircles, type Circle } from '@/lib/circles';

/** The green the tabs lean on, matching Home. */
const GREEN = Colors.light.primary;

function CircleRow({ circle }: { circle: Circle }) {
  const members = circle.members_count;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${circleLabel(circle)}, ${members} ${members === 1 ? 'member' : 'members'}`}
      onPress={() =>
        router.push({ pathname: '/circles/[circleId]', params: { circleId: circle.id } })
      }
      className="flex-row items-center gap-3 rounded-3xl bg-surface-card px-4 py-3.5 active:opacity-70">
      <CircleBadge initial={circle.icon_initial} color={circle.color_hex} />

      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <CircleName
            circle={circle}
            numberOfLines={1}
            className="font-body-semibold text-base leading-6 text-ink"
          />
          {/* The one thing that separates a circle you made from one you
              joined — they arrive in the same list. */}
          {circle.is_owner ? (
            <View className="rounded-full bg-surface-selected px-2 py-0.5">
              <Text className="font-body-semibold text-[11px] leading-4 text-ink-muted">Owner</Text>
            </View>
          ) : null}
        </View>

        <Text numberOfLines={1} className="mt-0.5 font-sans text-[13px] leading-[18px] text-ink-muted">
          {members === 1 ? '1 member' : `${members} members`}
          {/* Absent rather than zero where the server did not count, so a
              missing figure never reads as an empty circle. */}
          {circle.posts_count === undefined
            ? ''
            : ` · ${circle.posts_count === 1 ? '1 post' : `${circle.posts_count} posts`}`}
          {circle.tag ? ` · ${circle.tag}` : ''}
        </Text>
      </View>

      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        size={13}
        weight="bold"
        tintColor={Colors.light.textSecondary}
      />
    </Pressable>
  );
}

/**
 * The circles you are part of — the ones you made and the ones you joined.
 *
 * Took the tab slot that Alerts held; notifications did not go anywhere, they
 * are still a tap away on the bell in the header.
 */
export default function CirclesScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cursor = useRef<string | null>(null);
  const atEnd = useRef(false);
  const inFlight = useRef(false);
  // Set when a page fails, and what stops the list asking again on its own:
  // `onEndReached` re-fires for every new content length, and the footer
  // spinner changes the content length.
  const failed = useRef(false);

  const load = useCallback(
    async (reset: boolean) => {
      if (!token || inFlight.current) return;
      if (!reset && (atEnd.current || failed.current)) return;

      inFlight.current = true;
      try {
        const page = await fetchCircles(token, reset ? undefined : (cursor.current ?? undefined));

        cursor.current = page.meta.next_cursor;
        atEnd.current = page.meta.next_cursor === null;
        failed.current = false;
        setError(null);

        setCircles((previous) => {
          if (reset) return page.data;

          // A refresh racing a page-in could otherwise seat the same circle
          // twice, and a duplicate key is a hard error in a list.
          const seen = new Set(previous.map((circle) => circle.id));
          return previous.concat(page.data.filter((circle) => !seen.has(circle.id)));
        });
      } catch (caught) {
        failed.current = true;
        setError(caught instanceof Error ? caught.message : 'Could not load your circles.');
      } finally {
        inFlight.current = false;
      }
    },
    [token]
  );

  const refresh = useCallback(async () => {
    atEnd.current = false;
    failed.current = false;
    cursor.current = null;
    await load(true);
  }, [load]);

  // Making one, joining one and leaving one all happen on screens pushed over
  // this one, and all three change what belongs here. Coming back is the
  // moment to find out.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        await refresh();
        if (!cancelled) setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [refresh])
  );

  const loadMore = useCallback(async () => {
    if (atEnd.current || inFlight.current || failed.current) return;
    setLoadingMore(true);
    await load(false);
    setLoadingMore(false);
  }, [load]);

  const pull = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return (
    <View className="flex-1 bg-surface">
      <FlatList
        data={circles}
        keyExtractor={(circle) => circle.id}
        renderItem={({ item }) => <CircleRow circle={item} />}
        contentContainerClassName="w-full max-w-[800px] self-center gap-3 px-4"
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: BottomTabInset + insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={GREEN} />
        }
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View className="flex-row items-center justify-between pb-1">
            <Text className="font-heading-bold text-xl leading-7 text-ink">Your circles</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start a circle"
              onPress={() => router.push('/circles/new')}
              className="flex-row items-center gap-1.5 rounded-full px-3.5 py-2 active:opacity-85"
              style={{ backgroundColor: GREEN }}>
              <SymbolView
                name={{ ios: 'plus', android: 'add', web: 'add' }}
                size={13}
                weight="bold"
                tintColor="#FFFFFF"
              />
              <Text className="font-body-semibold text-[13px] leading-[18px] text-white">New</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View className="items-center py-12">
              <ActivityIndicator size="small" color={Colors.light.textSecondary} />
            </View>
          ) : (
            <View className="items-center gap-2 rounded-3xl bg-surface-card px-5 py-10">
              <Text className="text-center font-body-semibold text-base leading-6 text-ink">
                {error ? 'Could not load your circles' : 'No circles yet'}
              </Text>
              <Text className="text-center font-sans text-sm leading-5 text-ink-muted">
                {error ?? 'Start one and invite the people you want to grow alongside.'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => (error ? void refresh() : router.push('/circles/new'))}
                className="mt-2 rounded-full px-5 py-2.5 active:opacity-85"
                style={{ backgroundColor: GREEN }}>
                <Text className="font-body-semibold text-sm leading-5 text-white">
                  {error ? 'Try again' : 'Start a circle'}
                </Text>
              </Pressable>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View className="items-center py-6">
              <ActivityIndicator size="small" color={Colors.light.textSecondary} />
            </View>
          ) : null
        }
      />
    </View>
  );
}
