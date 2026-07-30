import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PostCard } from '@/components/post-card';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { useFeed } from '@/lib/feed-context';
import { goBack } from '@/lib/navigation';
import { fetchSavedPosts, withLikeState, type Post } from '@/lib/posts';

/**
 * The shelf: posts kept to come back to.
 *
 * Its own screen rather than a tab on the profile, because it is nobody else's
 * business — a profile is what you show people, and this is the one list about
 * you that is only ever yours.
 *
 * Paged as you scroll, like every other list of posts here. The pile has no
 * upper bound, and a screen that fetched it whole would be slowest for whoever
 * has used the feature most.
 */
export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { token } = useAuth();
  const { savedPostIds, adoptSavedState } = useFeed();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cursor = useRef<string | null>(null);
  const atEnd = useRef(false);
  const inFlight = useRef(false);
  /*
   * Set when a page fails, and what stops the list asking again on its own.
   *
   * `onEndReached` is not a one-shot — it re-fires for every new content
   * length, and the footer spinner appearing changes the content length. Same
   * guard the feed carries, and for the same reason.
   */
  const failed = useRef(false);

  const load = useCallback(
    async (reset: boolean) => {
      if (!token || inFlight.current) return;
      if (!reset && (atEnd.current || failed.current)) return;

      inFlight.current = true;
      try {
        const page = await fetchSavedPosts(
          token,
          reset ? undefined : (cursor.current ?? undefined)
        );

        cursor.current = page.meta.next_cursor;
        atEnd.current = page.meta.next_cursor === null;
        failed.current = false;
        setError(null);

        const rows = page.data.map(withLikeState);
        setPosts((previous) => {
          if (reset) return rows;

          // A duplicate key is a hard error in a list, and a page racing a
          // reset can hand back a post already on screen.
          const seen = new Set(previous.map((post) => post.id));
          return previous.concat(rows.filter((post) => !seen.has(post.id)));
        });

        // Everything here is saved by definition, so the bookmark on each card
        // — and on the same post sitting in the feed behind this screen — is
        // filled in from the page rather than from what the session remembers.
        adoptSavedState(page.data);
      } catch (caught) {
        failed.current = true;
        setError(caught instanceof Error ? caught.message : 'Could not load your saved posts.');
      } finally {
        inFlight.current = false;
      }
    },
    [token, adoptSavedState]
  );

  // Reloaded on every visit: a post saved from the feed since the last look
  // belongs on the pile, and the shelf is not a list this screen owns.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        atEnd.current = false;
        failed.current = false;
        cursor.current = null;
        await load(true);
        if (!cancelled) setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  const loadMore = useCallback(async () => {
    // Checked here as well as inside `load`, because the spinner this would
    // otherwise raise is itself what re-fires `onEndReached`.
    if (atEnd.current || inFlight.current || failed.current) return;
    setLoadingMore(true);
    await load(false);
    setLoadingMore(false);
  }, [load]);

  const refresh = useCallback(async () => {
    atEnd.current = false;
    failed.current = false;
    cursor.current = null;
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  /*
   * Unsaving from a card here takes the row off the list at once.
   *
   * The card has no idea which list it is drawn in, so it cannot remove itself;
   * what it does do is move the shared set, and this screen is the one place
   * where being in that set is the whole reason a row is on screen. Filtering
   * rather than deleting from state, so a mis-tap put right — the toast is the
   * undo — brings the post straight back where it was.
   */
  const shelf = posts.filter((post) => savedPostIds.has(post.id));

  return (
    <View className="flex-1 bg-surface">
      <View
        className="flex-row items-center gap-2 border-b border-hairline bg-surface-card px-4 pb-3"
        style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => goBack('/(tabs)/profile')}
          hitSlop={8}
          className="-ml-2 p-2 active:opacity-60">
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={18}
            tintColor={theme.text}
          />
        </Pressable>
        <Text className="flex-1 font-heading-bold text-xl leading-7 text-ink">Saved</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={theme.textSecondary} />
        </View>
      ) : (
        <FlatList
          data={shelf}
          keyExtractor={(post) => post.id}
          renderItem={({ item }) => <PostCard post={item} />}
          contentContainerClassName="w-full max-w-[800px] self-center"
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.6}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              tintColor={theme.textSecondary}
            />
          }
          ListEmptyComponent={
            <View className="mx-4 mt-6 items-center gap-2 rounded-3xl bg-surface-card px-5 py-12">
              <Text className="text-center font-body-semibold text-base leading-6 text-ink">
                {error ?? 'Nothing saved yet'}
              </Text>
              {error ? null : (
                <Text className="text-center font-sans text-sm leading-5 text-ink-muted">
                  Save a win from the menu on any post, and it waits for you here.
                </Text>
              )}
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
    </View>
  );
}
