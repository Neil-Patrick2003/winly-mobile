import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImageWithPlaceholder } from '@/components/ui/image';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { fetchInvitableFriends, inviteToCircle, type InvitableFriend } from '@/lib/circles';
import { goBack } from '@/lib/navigation';

const AVATAR = 40;

/**
 * The state of the button beside one friend.
 *
 * Four outcomes, and each says something different: already in, already asked,
 * turned it down before, or never asked. Collapsing the middle two into "not a
 * member" would make a sent invitation look like it had never gone.
 */
function friendState(friend: InvitableFriend) {
  if (friend.is_member) return 'member' as const;
  if (friend.invite_status === 'pending') return 'pending' as const;
  return 'invitable' as const;
}

/**
 * Ask friends into a circle.
 *
 * A friend is a follow that goes both ways — following someone is a one-way
 * interest, and pulling a stranger who happens to follow you into a group is
 * not something either of you asked for.
 */
export default function InviteToCircleScreen() {
  const { circleId } = useLocalSearchParams<{ circleId: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { token } = useAuth();

  const [friends, setFriends] = useState<InvitableFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const cursor = useRef<string | null>(null);
  const atEnd = useRef(false);
  const inFlight = useRef(false);
  const failed = useRef(false);

  const load = useCallback(
    async (reset: boolean) => {
      if (!token || !circleId || inFlight.current) return;
      if (!reset && (atEnd.current || failed.current)) return;

      inFlight.current = true;
      try {
        const page = await fetchInvitableFriends(
          circleId,
          token,
          reset ? undefined : (cursor.current ?? undefined)
        );

        cursor.current = page.meta.next_cursor;
        atEnd.current = page.meta.next_cursor === null;
        failed.current = false;
        setError(null);

        setFriends((previous) => {
          if (reset) return page.data;

          const seen = new Set(previous.map((friend) => friend.id));
          return previous.concat(page.data.filter((friend) => !seen.has(friend.id)));
        });
      } catch (caught) {
        failed.current = true;
        setError(caught instanceof Error ? caught.message : 'Could not load your friends.');
      } finally {
        inFlight.current = false;
      }
    },
    [token, circleId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
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

  const invite = useCallback(
    async (friend: InvitableFriend) => {
      if (!token || !circleId) return;

      setBusyId(friend.id);
      try {
        await inviteToCircle(circleId, friend.id, token);

        // Straight to pending: the ask is out, and it stays that way until they
        // answer it. Nothing here turns them into a member — only they can.
        setFriends((previous) =>
          previous.map((row) =>
            row.id === friend.id ? { ...row, invite_status: 'pending' as const } : row
          )
        );
      } catch (caught) {
        Alert.alert(
          'Could not send that invitation',
          caught instanceof Error ? caught.message : 'Please try again.'
        );
      } finally {
        setBusyId(null);
      }
    },
    [token, circleId]
  );

  return (
    <View className="flex-1 bg-surface">
      <View
        className="flex-row items-center gap-2 border-b border-hairline px-4 pb-3"
        style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => goBack({ pathname: '/circles/[circleId]', params: { circleId } })}
          hitSlop={8}
          className="-ml-2 p-2 active:opacity-60">
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={18}
            tintColor={theme.text}
          />
        </Pressable>
        <Text className="flex-1 font-heading-bold text-xl leading-7 text-ink">Invite friends</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={theme.textSecondary} />
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(friend) => friend.id}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 24 }}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => {
            const state = friendState(item);

            return (
              <View className="flex-row items-center gap-3 px-4 py-2.5">
                <ImageWithPlaceholder
                  source={{ uri: item.avatar_url }}
                  className="rounded-full"
                  size={AVATAR}
                  accessibilityLabel={`${item.full_name} profile photo`}>
                  <View
                    className="items-center justify-center rounded-full bg-primary"
                    style={{ width: AVATAR, height: AVATAR }}>
                    <Text className="font-heading-bold text-[15px] leading-5 text-white">
                      {(item.full_name.trim()[0] ?? '?').toUpperCase()}
                    </Text>
                  </View>
                </ImageWithPlaceholder>

                <View className="flex-1">
                  <Text
                    numberOfLines={1}
                    className="font-body-semibold text-[15px] leading-5 text-ink">
                    {item.full_name}
                  </Text>
                  {item.username ? (
                    <Text
                      numberOfLines={1}
                      className="font-sans text-[13px] leading-[18px] text-ink-muted">
                      @{item.username}
                    </Text>
                  ) : null}
                </View>

                {busyId === item.id ? (
                  <ActivityIndicator size="small" color={theme.textSecondary} />
                ) : state === 'member' ? (
                  <Text className="font-sans text-[13px] leading-[18px] text-ink-muted">
                    In circle
                  </Text>
                ) : state === 'pending' ? (
                  // Not a button: the ask is already out, and asking again
                  // would only replace it with itself.
                  <View className="rounded-full bg-surface-selected px-3.5 py-2">
                    <Text className="font-body-semibold text-[13px] leading-[18px] text-ink-muted">
                      Pending
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Invite ${item.full_name}`}
                    onPress={() => void invite(item)}
                    className="rounded-full px-3.5 py-2 active:opacity-85"
                    style={{ backgroundColor: theme.primary }}>
                    <Text
                      className="font-body-semibold text-[13px] leading-[18px]"
                      style={{ color: theme.onPrimary }}>
                      Invite
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View className="items-center gap-2 px-10 py-14">
              <Text className="text-center font-body-semibold text-base leading-6 text-ink">
                {error ? 'Could not load your friends' : 'No friends yet'}
              </Text>
              <Text className="text-center font-sans text-sm leading-5 text-ink-muted">
                {error ??
                  'Friends are people you follow who follow you back. Follow a few, and they will show up here.'}
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
