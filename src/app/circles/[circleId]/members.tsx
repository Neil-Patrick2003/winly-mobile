import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImageWithPlaceholder } from '@/components/ui/image';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import {
  blockMember,
  fetchBlockedMembers,
  fetchCircle,
  fetchCircleMembers,
  removeMember,
  unblockMember,
  type Circle,
  type CircleMember,
} from '@/lib/circles';
import type { UserSummary } from '@/lib/stories';
import { timeAgo } from '@/lib/time';
import { goBack } from '@/lib/navigation';

const AVATAR = 40;

function Avatar({ uri, name }: { uri: string | null; name: string }) {
  return (
    <ImageWithPlaceholder
      source={{ uri }}
      className="rounded-full"
      size={AVATAR}
      accessibilityLabel={`${name} profile photo`}>
      <View
        className="items-center justify-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500"
        style={{ width: AVATAR, height: AVATAR }}>
        <Text className="font-heading-bold text-[15px] leading-5 text-white">
          {(name.trim()[0] ?? '?').toUpperCase()}
        </Text>
      </View>
    </ImageWithPlaceholder>
  );
}

/**
 * Who is in a circle.
 *
 * The same screen for everybody, with the owner's actions attached: a separate
 * "manage" screen would be this list twice, and the two would drift.
 */
export default function CircleMembersScreen() {
  const { circleId } = useLocalSearchParams<{ circleId: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { token, user } = useAuth();

  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [blocked, setBlocked] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const cursor = useRef<string | null>(null);
  const atEnd = useRef(false);
  const inFlight = useRef(false);
  const failed = useRef(false);

  const loadMembers = useCallback(
    async (reset: boolean) => {
      if (!token || !circleId || inFlight.current) return;
      if (!reset && (atEnd.current || failed.current)) return;

      inFlight.current = true;
      try {
        const page = await fetchCircleMembers(
          circleId,
          token,
          reset ? undefined : (cursor.current ?? undefined)
        );

        cursor.current = page.meta.next_cursor;
        atEnd.current = page.meta.next_cursor === null;
        failed.current = false;

        setMembers((previous) => {
          if (reset) return page.data;

          const seen = new Set(previous.map((member) => member.id));
          return previous.concat(page.data.filter((member) => !seen.has(member.id)));
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

    const found = await fetchCircle(circleId, token).catch(() => null);
    setCircle(found);
    await loadMembers(true);

    // Only the owner may ask, so only the owner asks. Anyone else would get a
    // 403 for a list their screen does not show.
    if (found?.is_owner) {
      const barred = await fetchBlockedMembers(circleId, token).catch(() => null);
      setBlocked(barred?.data ?? []);
    }
  }, [token, circleId, loadMembers]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const loadMore = useCallback(async () => {
    if (atEnd.current || inFlight.current || failed.current) return;
    setLoadingMore(true);
    await loadMembers(false);
    setLoadingMore(false);
  }, [loadMembers]);

  const act = useCallback(
    async (member: CircleMember, action: 'remove' | 'block') => {
      if (!token || !circleId) return;

      setBusyId(member.id);
      try {
        if (action === 'remove') {
          await removeMember(circleId, member.id, token);
        } else {
          await blockMember(circleId, member.id, token);
          setBlocked((previous) => [...previous, member]);
        }

        setMembers((previous) => previous.filter((row) => row.id !== member.id));
        setCircle((previous) =>
          previous
            ? { ...previous, members_count: Math.max(previous.members_count - 1, 0) }
            : previous
        );
      } catch (caught) {
        Alert.alert(
          'That did not work',
          caught instanceof Error ? caught.message : 'Please try again.'
        );
      } finally {
        setBusyId(null);
      }
    },
    [token, circleId]
  );

  const confirm = useCallback(
    (member: CircleMember, action: 'remove' | 'block') => {
      const removing = action === 'remove';

      Alert.alert(
        removing ? `Remove ${member.full_name}?` : `Block ${member.full_name}?`,
        removing
          ? 'They can join again if they want to.'
          : 'They are removed and cannot rejoin or be invited back.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: removing ? 'Remove' : 'Block',
            style: 'destructive',
            onPress: () => void act(member, action),
          },
        ]
      );
    },
    [act]
  );

  /** The owner's actions for one member. */
  const openMenu = useCallback(
    (member: CircleMember) => {
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: member.full_name,
            options: ['Cancel', 'Remove from circle', 'Block'],
            destructiveButtonIndex: 2,
            cancelButtonIndex: 0,
          },
          (index) => {
            if (index === 1) confirm(member, 'remove');
            if (index === 2) confirm(member, 'block');
          }
        );
        return;
      }

      Alert.alert(member.full_name, undefined, [
        { text: 'Remove from circle', onPress: () => confirm(member, 'remove') },
        { text: 'Block', style: 'destructive', onPress: () => confirm(member, 'block') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [confirm]
  );

  const unblock = useCallback(
    async (person: UserSummary) => {
      if (!token || !circleId) return;

      setBusyId(person.id);
      try {
        await unblockMember(circleId, person.id, token);
        setBlocked((previous) => previous.filter((row) => row.id !== person.id));
      } catch (caught) {
        Alert.alert(
          'That did not work',
          caught instanceof Error ? caught.message : 'Please try again.'
        );
      } finally {
        setBusyId(null);
      }
    },
    [token, circleId]
  );

  const canManage = circle?.is_owner ?? false;

  return (
    <View className="flex-1 bg-surface">
      <View
        className="flex-row items-center gap-2 border-b border-hairline px-4 pb-3"
        style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => goBack({ pathname: '/circles/[circleId]', params: { circleId } })}
          hitSlop={8}
          className="-ml-2 p-2 active:opacity-60">
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={18}
            tintColor={theme.text}
          />
        </Pressable>
        <Text className="flex-1 font-heading-bold text-xl leading-7 text-ink">Members</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={theme.textSecondary} />
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(member) => member.id}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 24 }}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => (
            <View className="flex-row items-center gap-3 px-4 py-2.5">
              <Avatar uri={item.avatar_url} name={item.full_name} />

              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text
                    numberOfLines={1}
                    className="font-body-semibold text-[15px] leading-5 text-ink">
                    {item.full_name}
                  </Text>
                  {item.is_owner ? (
                    <View className="rounded-full bg-surface-selected px-2 py-0.5">
                      <Text className="font-body-semibold text-[11px] leading-4 text-ink-muted">
                        Owner
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text className="font-sans text-[12px] leading-4 text-ink-muted">
                  Joined {timeAgo(item.joined_at)}
                </Text>
              </View>

              {/* Nothing to do to yourself, and the owner cannot be turned out
                  of their own circle — the server refuses both. */}
              {canManage && !item.is_owner && item.id !== user?.id ? (
                busyId === item.id ? (
                  <ActivityIndicator size="small" color={theme.textSecondary} />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Manage ${item.full_name}`}
                    onPress={() => openMenu(item)}
                    hitSlop={8}
                    className="p-2 active:opacity-60">
                    <SymbolView
                      name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
                      size={16}
                      tintColor={theme.textSecondary}
                    />
                  </Pressable>
                )
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <Text className="px-10 py-12 text-center font-sans text-[15px] leading-[22px] text-ink-muted">
              Nobody here yet.
            </Text>
          }
          ListFooterComponent={
            <View>
              {loadingMore ? (
                <View className="py-4">
                  <ActivityIndicator size="small" color={theme.textSecondary} />
                </View>
              ) : null}

              {canManage && blocked.length > 0 ? (
                <View className="mt-6 border-t border-hairline pt-4">
                  <Text className="px-4 font-body-semibold text-[13px] leading-[18px] text-ink-muted">
                    Blocked
                  </Text>
                  {blocked.map((person) => (
                    <View key={person.id} className="flex-row items-center gap-3 px-4 py-2.5">
                      <Avatar uri={person.avatar_url} name={person.full_name} />
                      <Text
                        numberOfLines={1}
                        className="flex-1 font-body-semibold text-[15px] leading-5 text-ink">
                        {person.full_name}
                      </Text>
                      {busyId === person.id ? (
                        <ActivityIndicator size="small" color={theme.textSecondary} />
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Unblock ${person.full_name}`}
                          onPress={() => void unblock(person)}
                          className="rounded-full bg-surface-selected px-3.5 py-2 active:opacity-70">
                          <Text className="font-body-semibold text-[13px] leading-[18px] text-ink">
                            Unblock
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}
