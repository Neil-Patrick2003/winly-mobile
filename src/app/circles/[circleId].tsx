import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, FlatList, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PostCard } from '@/components/post-card';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import {
  deleteCircle,
  fetchCircle,
  fetchCirclePosts,
  joinCircle,
  type Circle,
} from '@/lib/circles';
import type { Post } from '@/lib/posts';

/**
 * One circle: what has been shared into it.
 *
 * The wall carries the screen — a group is what people put in it. Who is in it
 * is a tap on the member count away, and the owner's tools sit behind the
 * overflow menu rather than competing with the one thing most people came to
 * do, which is invite somebody.
 */
export default function CircleScreen() {
  const { circleId } = useLocalSearchParams<{ circleId: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { token } = useAuth();

  const [circle, setCircle] = useState<Circle | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cursor = useRef<string | null>(null);
  const atEnd = useRef(false);
  const inFlight = useRef(false);
  const failed = useRef(false);

  const loadPosts = useCallback(
    async (reset: boolean) => {
      if (!token || !circleId || inFlight.current) return;
      if (!reset && (atEnd.current || failed.current)) return;

      inFlight.current = true;
      try {
        const page = await fetchCirclePosts(
          circleId,
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
      } catch {
        failed.current = true;
      } finally {
        inFlight.current = false;
      }
    },
    [token, circleId]
  );

  const load = useCallback(async () => {
    if (!token || !circleId) return;

    atEnd.current = false;
    failed.current = false;
    cursor.current = null;

    try {
      const [found] = await Promise.all([fetchCircle(circleId, token), loadPosts(true)]);
      setCircle(found);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load this circle.');
    }
  }, [token, circleId, loadPosts]);

  // Inviting, managing and posting all happen on screens pushed over this one,
  // and all three change what belongs here.
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

  /**
   * Join, for somebody looking at a circle they are not in yet.
   *
   * Reachable from a post's circle chip or a link, which is the only way to
   * arrive here from outside — the list on the tab only holds circles you are
   * already part of.
   */
  const join = useCallback(async () => {
    if (!token || !circle) return;

    try {
      const state = await joinCircle(circle.id, token);
      setCircle((previous) =>
        previous
          ? { ...previous, is_member: state.is_member, members_count: state.members_count }
          : previous
      );
    } catch (caught) {
      Alert.alert(
        'Could not join that circle',
        caught instanceof Error ? caught.message : 'Please try again.'
      );
    }
  }, [token, circle]);

  const confirmDelete = useCallback(() => {
    if (!token || !circle) return;

    Alert.alert('Delete this circle?', 'It disappears for every member, and cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteCircle(circle.id, token);
              router.back();
            } catch (caught) {
              Alert.alert(
                'Could not delete that circle',
                caught instanceof Error ? caught.message : 'Please try again.'
              );
            }
          })();
        },
      },
    ]);
  }, [token, circle]);

  /**
   * The owner's tools.
   *
   * A native sheet on iOS and an alert elsewhere: both are the platform's own
   * way of offering a short list of actions, and neither needs a dependency.
   */
  const openMenu = useCallback(() => {
    if (!circle) return;

    const manage = () =>
      router.push({ pathname: '/circles/[circleId]/members', params: { circleId: circle.id } });

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Manage members', 'Delete circle'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) manage();
          if (index === 2) confirmDelete();
        }
      );
      return;
    }

    Alert.alert(circle.name, undefined, [
      { text: 'Manage members', onPress: manage },
      { text: 'Delete circle', style: 'destructive', onPress: confirmDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [circle, confirmDelete]);

  const members = circle?.members_count ?? 0;
  const shared = circle?.posts_count;

  const accent = circle?.color_hex ?? '#94A3B8';

  const header = (
    <View>
      {/*
        The circle's own colour as a banner, lightened towards the bottom so the
        badge sitting on the seam stays legible. Its colour rather than one
        fixed green: every circle already has one, and a screen that looked the
        same for all of them would waste it.
      */}
      <View style={{ height: insets.top + 132, backgroundColor: accent }}>
        <View className="absolute inset-0 bg-linear-to-b from-white/0 to-white/45" />
      </View>

      {/* Pulled up over the banner's edge, so the badge straddles the seam. */}
      <View className="-mt-11 flex-row items-end justify-between px-6">
        {/* Opaque, not a tint laid straight over the seam: the badge sits half
            on the banner and half off it, and a translucent fill would come out
            two different colours down the middle. The surface underneath is
            what makes the tint above it read the same either side. */}
        <View className="h-[88px] w-[88px] overflow-hidden rounded-3xl bg-surface-card">
          <View
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: `${accent}24` }}>
            <Text className="font-heading-bold text-4xl leading-[44px]" style={{ color: accent }}>
              {(circle?.icon_initial.trim()[0] ?? '?').toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Reads as a state rather than a button once you are in — there is
            nothing to do to a circle you have already joined. Someone looking
            at one from outside gets the way in instead. */}
        {circle ? (
          circle.is_member ? (
            <View
              className="mb-1 flex-row items-center gap-1.5 rounded-full border px-4 py-2"
              style={{ borderColor: accent }}>
              <Text className="font-body-semibold text-[14px] leading-5" style={{ color: accent }}>
                Joined
              </Text>
              <SymbolView
                name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                size={12}
                weight="bold"
                tintColor={accent}
              />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Join ${circle.name}`}
              onPress={() => void join()}
              className="mb-1 rounded-full px-4 py-2 active:opacity-85"
              style={{ backgroundColor: accent }}>
              <Text className="font-body-semibold text-[14px] leading-5 text-white">Join</Text>
            </Pressable>
          )
        ) : null}
      </View>

      <View className="mt-4 px-6">
        <View className="flex-row items-center gap-1.5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={10}
            className="-ml-1 active:opacity-60">
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              size={17}
              weight="semibold"
              tintColor={theme.textSecondary}
            />
          </Pressable>
          <Text numberOfLines={1} className="flex-1 font-heading-bold text-2xl leading-8 text-ink">
            {circle?.name ?? ''}
          </Text>
        </View>

        {/* The counts are the way in to the member list, for everyone — the
            owner's menu manages them, this only shows them. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${members} ${members === 1 ? 'member' : 'members'}. See who is in.`}
          disabled={!circle}
          onPress={() =>
            circle
              ? router.push({
                  pathname: '/circles/[circleId]/members',
                  params: { circleId: circle.id },
                })
              : undefined
          }
          className="mt-1 self-start active:opacity-60">
          <Text className="font-sans text-[15px] leading-[21px] text-ink-muted">
            {members === 1 ? '1 member' : `${members} members`}
            {/* Absent rather than zero where the server did not count, so a
                missing figure never reads as an empty circle. */}
            {shared === undefined ? '' : ` · ${shared === 1 ? '1 win' : `${shared} wins`}`}
          </Text>
        </Pressable>

        {circle?.tag ? (
          <View
            className="mt-3 self-start rounded-full px-3.5 py-2"
            style={{ backgroundColor: `${accent}1F` }}>
            <Text className="font-body-semibold text-[13px] leading-[18px]" style={{ color: accent }}>
              {circle.tag}
            </Text>
          </View>
        ) : null}

        {circle?.description ? (
          <Text className="mt-3 font-sans text-[15px] leading-[22px] text-ink">
            {circle.description}
          </Text>
        ) : null}
      </View>

      {circle ? (
        <View className="mt-5 flex-row items-center justify-between border-t border-hairline px-6 pb-4 pt-5">
          <Text className="font-heading-bold text-lg leading-6 text-ink">Circle wins</Text>

          {/* The circle rides along as a parameter, so the flow that opens
              knows where the win is bound and Review can say so before it
              goes. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Share a win to ${circle.name}`}
            onPress={() =>
              router.push({
                pathname: '/entry',
                params: { circleId: circle.id, circleName: circle.name },
              })
            }
            hitSlop={8}
            className="active:opacity-60">
            <Text className="font-body-semibold text-[15px] leading-5" style={{ color: theme.primary }}>
              + Share a win
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    // White rather than the page grey, so the posts sit on the same surface as
    // the screen around them instead of reading as cards floated on it — the
    // wall is one sheet.
    <View className="flex-1 bg-surface-card">
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={theme.textSecondary} />
        </View>
      ) : error && !circle ? (
        <View className="flex-1 items-center justify-center px-10">
          <Text className="text-center font-sans text-[15px] leading-[22px] text-ink-muted">
            {error}
          </Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(post) => post.id}
          renderItem={({ item }) => <PostCard post={item} />}
          ListHeaderComponent={header}
          contentContainerClassName="w-full max-w-[800px] self-center"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.6}
          ListEmptyComponent={
            // Filled with the page grey, not the card white the screen now is —
            // a white panel on a white sheet is no panel at all.
            <View className="mx-4 items-center gap-2 rounded-3xl bg-surface px-5 py-10">
              <Text className="text-center font-body-semibold text-base leading-6 text-ink">
                Nothing shared yet
              </Text>
              <Text className="text-center font-sans text-sm leading-5 text-ink-muted">
                Wins shared into this circle show up here.
              </Text>
              {circle ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: '/entry',
                      params: { circleId: circle.id, circleName: circle.name },
                    })
                  }
                  className="mt-2 rounded-full px-5 py-2.5 active:opacity-85"
                  style={{ backgroundColor: theme.primary }}>
                  <Text
                    className="font-body-semibold text-sm leading-5"
                    style={{ color: theme.onPrimary }}>
                    Share the first win
                  </Text>
                </Pressable>
              ) : null}
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View className="py-6">
                <ActivityIndicator size="small" color={theme.textSecondary} />
              </View>
            ) : null
          }
        />
      )}

      {/* Floated over the banner rather than sitting in a bar of their own: the
          reference gives the whole top of the screen to the circle, and a
          header strip above it would take that back. White because they sit on
          the circle's colour, whatever it is. */}
      <View
        className="absolute right-4 flex-row items-center gap-1"
        style={{ top: insets.top + 4 }}
        pointerEvents="box-none">
        {circle?.is_member ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Invite members"
            onPress={() =>
              router.push({
                pathname: '/circles/[circleId]/invite',
                params: { circleId: circle.id },
              })
            }
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/15 active:opacity-60">
            <SymbolView
              name={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }}
              size={18}
              tintColor="#FFFFFF"
            />
          </Pressable>
        ) : null}

        {/* Managing and deleting are the owner's alone, and the server agrees —
            so the menu is not offered where everything in it would earn a 403. */}
        {circle?.is_owner ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Circle options"
            onPress={openMenu}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/15 active:opacity-60">
            <SymbolView
              name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
              size={18}
              tintColor="#FFFFFF"
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
