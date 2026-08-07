import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CircleName } from '@/components/circle-name';
import { PostCard } from '@/components/post-card';
import { MenuButton, type MenuItem } from '@/components/ui/menu';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import {
  deleteCircle,
  fetchCircle,
  fetchCirclePosts,
  fetchSubCircles,
  joinCircle,
  leaveCircle,
  syncMyPostsToCircle,
  type Circle,
} from '@/lib/circles';
import { useConfirm } from '@/lib/confirm';
import { useFeed } from '@/lib/feed-context';
import type { Post } from '@/lib/posts';
import { goBack } from '@/lib/navigation';
import { useToast } from '@/lib/toast';

/** The icons the overflow menu draws, in the post card's own vocabulary. */
const EDIT_ICON = { ios: 'square.and.pencil', android: 'edit', web: 'edit' } as const;
const MEMBERS_ICON = { ios: 'person.2', android: 'group', web: 'group' } as const;
const LEAVE_ICON = {
  ios: 'rectangle.portrait.and.arrow.right',
  android: 'logout',
  web: 'logout',
} as const;
const DELETE_ICON = { ios: 'trash', android: 'delete', web: 'delete' } as const;

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
  const { adoptSavedState } = useFeed();
  const showToast = useToast();
  const confirm = useConfirm();

  const [circle, setCircle] = useState<Circle | null>(null);
  /**
   * The circles inside this one.
   *
   * Loaded alongside it rather than on its own screen: what a circle contains
   * is part of what it is, and hiding them behind a tap would leave most of
   * them never found. Empty for a circle with none, and for one that is itself
   * inside another — they do not nest.
   */
  const [inner, setInner] = useState<Circle[]>([]);
  const [syncing, setSyncing] = useState(false);
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
    [token, circleId, adoptSavedState]
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

      /*
       * Asked for separately, and allowed to fail quietly.
       *
       * A circle whose inner circles could not be listed is still one worth
       * showing — the wall below is the point of the screen, and an error over
       * the whole page because one extra list did not arrive would be the
       * lesser thing breaking the greater.
       */
      setInner(found.is_sub_circle ? [] : await fetchSubCircles(circleId, token).catch(() => []));
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

  /** How many of your earlier posts this circle has not seen. */
  const syncable = circle?.syncable_posts_count ?? 0;

  /** "1 post" / "8 posts", which three strings here all need. */
  const syncableLabel = `${syncable} ${syncable === 1 ? 'post' : 'posts'}`;

  /**
   * Bring them in.
   *
   * The wall is reloaded rather than patched: the wins land in date order among
   * whatever is already there, and working out where each one belongs on the
   * client would be reimplementing the ordering the server already did.
   */
  const syncMine = useCallback(async () => {
    if (!token || !circle || syncing) return;

    const confirmed = await confirm({
      // Says plainly that the members will be able to read them: some of these
      // were written for other circles, and a message that implied otherwise
      // would be the one place this could surprise somebody.
      title: `Add your ${syncableLabel}?`,
      message:
        syncable === 1
          ? `It goes on ${circle.name}'s wall, where everyone in the circle can read it. It stays wherever else you shared it.`
          : `They go on ${circle.name}'s wall, where everyone in the circle can read them. They stay wherever else you shared them.`,
      confirmLabel: 'Add them',
    });

    if (!confirmed) return;

    setSyncing(true);
    try {
      const result = await syncMyPostsToCircle(circle.id, token);

      setCircle((previous) =>
        previous
          ? {
              ...previous,
              syncable_posts_count: result.syncable_posts_count,
              // The header counts what is on the wall, and the wall just grew.
              // Left alone it would keep the figure from before the press until
              // the screen was left and come back to.
              posts_count:
                previous.posts_count === undefined
                  ? undefined
                  : previous.posts_count + result.shared,
            }
          : previous
      );
      await loadPosts(true);

      showToast(
        result.shared === 1 ? '1 post added to this circle' : `${result.shared} posts added`
      );
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'That did not work.');
    } finally {
      setSyncing(false);
    }
  }, [token, circle, syncing, syncable, syncableLabel, confirm, loadPosts, showToast]);

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

  /**
   * Leave, for anyone who is in it.
   *
   * The screen stays where it is rather than going back to the list: what is
   * shared in a circle is worth reading whether or not you are in it, and the
   * badge turning back into Join is the whole of what changed. The owner may
   * leave their own — the server allows it, and a circle whose owner is obliged
   * to stay is one nobody can step back from — and it stays theirs.
   */
  const leave = useCallback(async () => {
    if (!token || !circle) return;

    const confirmed = await confirm({
      title: `Leave ${circle.name}?`,
      message: circle.is_owner
        ? 'It stays yours, and you can join again whenever you like.'
        : 'You can join again whenever you like.',
      confirmLabel: 'Leave',
      destructive: true,
    });

    if (!confirmed) return;

    try {
      const state = await leaveCircle(circle.id, token);
      setCircle((previous) =>
        previous
          ? { ...previous, is_member: state.is_member, members_count: state.members_count }
          : previous
      );
      showToast(`Left ${circle.name}`);
    } catch (caught) {
      Alert.alert(
        'Could not leave that circle',
        caught instanceof Error ? caught.message : 'Please try again.'
      );
    }
  }, [confirm, token, circle, showToast]);

  const remove = useCallback(async () => {
    if (!token || !circle) return;

    const confirmed = await confirm({
      title: 'Delete this circle?',
      message: 'It disappears for every member, and cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });

    if (!confirmed) return;

    try {
      await deleteCircle(circle.id, token);
      goBack('/(tabs)/circles');
    } catch (caught) {
      Alert.alert(
        'Could not delete that circle',
        caught instanceof Error ? caught.message : 'Please try again.'
      );
    }
  }, [confirm, token, circle]);

  /**
   * What this person may do to the circle, in order of how much it costs them.
   *
   * The owner's tools first, then leaving, then taking the whole thing down.
   * Built as a list rather than a platform sheet because the same menu has to
   * work on the web, where `Alert` draws nothing at all — see `confirmDestructive`.
   */
  const menu: MenuItem[] = circle
    ? [
        ...(circle.is_owner
          ? [
              {
                label: 'Edit circle',
                icon: EDIT_ICON,
                onPress: () =>
                  router.push({
                    pathname: '/circles/[circleId]/edit' as const,
                    params: { circleId: circle.id },
                  }),
              },
              {
                label: 'Manage members',
                icon: MEMBERS_ICON,
                onPress: () =>
                  router.push({
                    pathname: '/circles/[circleId]/members' as const,
                    params: { circleId: circle.id },
                  }),
              },
            ]
          : []),
        ...(circle.is_member
          ? [
              {
                label: 'Leave circle',
                icon: LEAVE_ICON,
                destructive: true,
                onPress: () => void leave(),
              },
            ]
          : []),
        ...(circle.is_owner
          ? [
              {
                label: 'Delete circle',
                icon: DELETE_ICON,
                destructive: true,
                onPress: () => void remove(),
              },
            ]
          : []),
      ]
    : [];

  const members = circle?.members_count ?? 0;
  const shared = circle?.posts_count;

  // A circle always has a colour; this covers the frame before it has loaded,
  // and is the palette's own muted green rather than a stray slate.
  const accent = circle?.color_hex ?? Colors.light.textSecondary;

  const header = (
    <View>
      {/*
        The circle's own colour as a banner, flat — its colour rather than one
        fixed green, because every circle already has one and a screen that
        looked the same for all of them would waste it. The badge that straddles
        the lower edge is opaque, so it stays legible without the wash of white
        that used to be laid over the bottom of this.
      */}
      <View style={{ height: insets.top + 132, backgroundColor: accent }} />

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
            <View className="mb-1 flex-row items-center gap-2">
              {/* Beside Joined, and only while there is something to bring.
                  A post goes to the circles you were in when you wrote it, so a
                  circle joined today has none of your history — the wall says
                  somebody who has posted for months has never shared a thing.
                  This is how that gets filled in. */}
              {syncable > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Share your earlier ${syncableLabel} into ${circle.name}`}
                  accessibilityState={{ busy: syncing }}
                  disabled={syncing}
                  onPress={() => void syncMine()}
                  // Allowed to shrink, and Joined is not: a three-figure count
                  // would otherwise push the badge past the edge of the screen.
                  className="shrink flex-row items-center gap-1.5 rounded-full px-3.5 py-2 active:opacity-85"
                  style={{ backgroundColor: `${accent}1F` }}>
                  {syncing ? (
                    <ActivityIndicator size="small" color={accent} />
                  ) : (
                    <SymbolView
                      name={{
                        ios: 'arrow.triangle.2.circlepath',
                        android: 'sync',
                        web: 'sync',
                      }}
                      size={12}
                      weight="bold"
                      tintColor={accent}
                    />
                  )}
                  <Text
                    numberOfLines={1}
                    className="shrink font-body-semibold text-[13px] leading-[18px]"
                    style={{ color: accent }}>
                    {syncing ? 'Sharing…' : `Add my ${syncableLabel}`}
                  </Text>
                </Pressable>
              ) : null}

              <View
                className="flex-row items-center gap-1.5 rounded-full border px-4 py-2"
                style={{ borderColor: accent }}>
                <Text
                  className="font-body-semibold text-[14px] leading-5"
                  style={{ color: accent }}>
                  Joined
                </Text>
                <SymbolView
                  name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                  size={12}
                  weight="bold"
                  tintColor={accent}
                />
              </View>
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
            onPress={() => goBack('/(tabs)/circles')}
            hitSlop={10}
            className="-ml-1 active:opacity-60">
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              size={17}
              weight="semibold"
              tintColor={theme.textSecondary}
            />
          </Pressable>
          {/* Named the same here as in every list and chip — see CircleName. */}
          <CircleName
            circle={circle ?? { name: '' }}
            numberOfLines={1}
            className="flex-1 font-heading-bold text-2xl leading-8 text-ink"
            parentClassName="font-sans text-xl text-ink-muted"
          />
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
            {/* Posts, not wins: this counts what is on the wall, and each one
                of those carries a win or three inside it. The circles tab has
                always called the same figure posts. */}
            {shared === undefined ? '' : ` · ${shared === 1 ? '1 post' : `${shared} posts`}`}
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

      {/* The circles inside this one.
          Listed and never created here: opening one decides who can read a
          group's wins, and that is done from the website on the owner's manage
          page. Shown to everybody who can see the parent, because knowing a
          circle has smaller circles in it is part of what it is. */}
      {circle && !circle.is_sub_circle && inner.length > 0 ? (
        <View className="mt-5 border-t border-hairline px-6 pt-5">
          <Text className="font-heading-bold text-lg leading-6 text-ink">Circles inside</Text>

          <View className="mt-3 gap-2">
            {inner.map((sub) => (
              <Pressable
                key={sub.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${sub.name}`}
                onPress={() =>
                  router.push({ pathname: '/circles/[circleId]', params: { circleId: sub.id } })
                }
                className="flex-row items-center gap-3 rounded-2xl bg-surface-card px-4 py-3 active:opacity-70">
                <View
                  className="h-9 w-9 items-center justify-center rounded-xl"
                  style={{ backgroundColor: sub.color_hex }}>
                  <Text className="font-heading-bold text-[15px] leading-5 text-white">
                    {sub.icon_initial}
                  </Text>
                </View>

                <View className="flex-1">
                  {/* The parent's name rides along, so a circle reads the same
                      here as it does anywhere else it is named. */}
                  <CircleName
                    circle={sub}
                    numberOfLines={1}
                    className="font-body-semibold text-[15px] leading-5 text-ink"
                  />
                  <Text className="mt-0.5 font-sans text-[12px] leading-4 text-ink-muted">
                    {sub.members_count === 1 ? '1 member' : `${sub.members_count} members`}
                    {sub.owner ? ` · kept by ${sub.owner.full_name}` : ''}
                  </Text>
                </View>

                {sub.is_member ? (
                  <SymbolView
                    name={{
                      ios: 'checkmark.circle.fill',
                      android: 'check_circle',
                      web: 'check_circle',
                    }}
                    size={18}
                    tintColor={accent}
                  />
                ) : null}
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

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

        {/* Not offered to somebody looking in from outside, who has nothing to
            edit, nothing to manage and nothing to leave — the join button above
            is the whole of what they can do here. */}
        {menu.length > 0 ? (
          <MenuButton
            items={menu}
            accessibilityLabel="Circle options"
            tintColor="#FFFFFF"
            className="h-10 w-10 items-center justify-center rounded-full bg-black/15 active:opacity-60"
          />
        ) : null}
      </View>
    </View>
  );
}
