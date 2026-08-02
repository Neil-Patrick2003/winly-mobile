import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImageWithPlaceholder } from '@/components/ui/image';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { fetchStoryViewers, reactionEmoji, type StoryViewer } from '@/lib/stories';
import { timeAgo } from '@/lib/time';
import { goBack } from '@/lib/navigation';

const AVATAR = 40;

function ViewerRow({ viewer }: { viewer: StoryViewer }) {
  const name = viewer.full_name;

  return (
    <View className="flex-row items-center gap-3 px-4 py-2.5">
      <ImageWithPlaceholder
        source={{ uri: viewer.avatar_url }}
        className="rounded-full"
        size={AVATAR}
        accessibilityLabel={`${name} profile photo`}>
        <View
          className="items-center justify-center rounded-full bg-primary"
          style={{ width: AVATAR, height: AVATAR }}>
          <Text className="font-heading-bold text-[15px] leading-5 text-white">
            {(name.trim()[0] ?? '?').toUpperCase()}
          </Text>
        </View>
      </ImageWithPlaceholder>

      <View className="flex-1">
        <Text numberOfLines={1} className="font-body-semibold text-[15px] leading-5 text-ink">
          {name}
        </Text>
        {viewer.username ? (
          <Text numberOfLines={1} className="font-sans text-[13px] leading-[18px] text-ink-muted">
            @{viewer.username}
          </Text>
        ) : null}
      </View>

      {/* What they left, where they left anything — most people just watch. */}
      {viewer.reaction_type ? (
        <Text
          accessibilityLabel={`Reacted ${viewer.reaction_type}`}
          className="text-[17px] leading-6">
          {reactionEmoji(viewer.reaction_type)}
        </Text>
      ) : null}

      <Text className="font-sans text-[12px] leading-4 text-ink-muted">
        {timeAgo(viewer.viewed_at)}
      </Text>
    </View>
  );
}

/**
 * Who watched one of your stories, most recent first.
 *
 * Only ever your own: the server refuses the list to anyone but the poster, so
 * this screen is reachable only from the seen-by count on a story you shared.
 */
export default function StoryViewersScreen() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { token } = useAuth();

  const [viewers, setViewers] = useState<StoryViewer[]>([]);
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
      if (!token || !storyId || inFlight.current) return;
      if (!reset && (atEnd.current || failed.current)) return;

      inFlight.current = true;
      try {
        const page = await fetchStoryViewers(
          storyId,
          token,
          reset ? undefined : (cursor.current ?? undefined)
        );

        cursor.current = page.meta.next_cursor;
        atEnd.current = page.meta.next_cursor === null;
        failed.current = false;
        setError(null);

        setViewers((previous) => {
          if (reset) return page.data;

          // A duplicate key is a hard error in a list, and a page racing a
          // reset can hand back somebody already seated.
          const seen = new Set(previous.map((viewer) => viewer.id));
          return previous.concat(page.data.filter((viewer) => !seen.has(viewer.id)));
        });
      } catch (caught) {
        failed.current = true;
        // Unlike the rail, this screen is the whole point of the tap — an
        // empty list where the answer should be would read as "nobody", which
        // is a different and wrong answer.
        setError(caught instanceof Error ? caught.message : 'Could not load who watched.');
      } finally {
        inFlight.current = false;
      }
    },
    [token, storyId]
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
        <Text className="flex-1 font-heading-bold text-xl leading-7 text-ink">Viewers</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={theme.textSecondary} />
        </View>
      ) : (
        <FlatList
          data={viewers}
          keyExtractor={(viewer) => viewer.id}
          renderItem={({ item }) => <ViewerRow viewer={item} />}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 16 }}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View className="items-center px-10 py-16">
              <Text className="text-center font-sans text-[15px] leading-[22px] text-ink-muted">
                {error ?? 'Nobody has watched this one yet.'}
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
