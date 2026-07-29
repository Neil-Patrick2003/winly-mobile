import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CircleBadge } from '@/components/circle-badge';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import {
  acceptInvitation,
  declineInvitation,
  fetchInvitations,
  type CircleInvitation,
} from '@/lib/circles';
import { timeAgo } from '@/lib/time';
import { useToast } from '@/lib/toast';

/**
 * Alerts.
 *
 * Circle invitations are what lives here today — being asked into a group is
 * the one thing so far that waits on an answer rather than merely reporting
 * that something happened. Cheers, follows and replies are still to come, which
 * is why the empty state still names them.
 */
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { token } = useAuth();
  const showToast = useToast();

  const [invitations, setInvitations] = useState<CircleInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const cursor = useRef<string | null>(null);
  const atEnd = useRef(false);
  const inFlight = useRef(false);
  const failed = useRef(false);

  const load = useCallback(
    async (reset: boolean) => {
      if (!token || inFlight.current) return;
      if (!reset && (atEnd.current || failed.current)) return;

      inFlight.current = true;
      try {
        const page = await fetchInvitations(
          token,
          reset ? undefined : (cursor.current ?? undefined)
        );

        cursor.current = page.meta.next_cursor;
        atEnd.current = page.meta.next_cursor === null;
        failed.current = false;
        setError(null);

        setInvitations((previous) => {
          if (reset) return page.data;

          const seen = new Set(previous.map((invitation) => invitation.id));
          return previous.concat(page.data.filter((invitation) => !seen.has(invitation.id)));
        });
      } catch (caught) {
        failed.current = true;
        setError(caught instanceof Error ? caught.message : 'Could not load your alerts.');
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const respond = useCallback(
    async (invitation: CircleInvitation, accept: boolean) => {
      if (!token) return;

      setBusyId(invitation.id);
      try {
        if (accept) {
          await acceptInvitation(invitation.id, token);
          showToast(`You joined ${invitation.circle?.name ?? 'the circle'} 🌱`);
        } else {
          await declineInvitation(invitation.id, token);
        }

        // Answered is no longer news — it drops off the list either way.
        setInvitations((previous) => previous.filter((row) => row.id !== invitation.id));
      } catch (caught) {
        Alert.alert(
          'That did not work',
          caught instanceof Error ? caught.message : 'Please try again.'
        );
      } finally {
        setBusyId(null);
      }
    },
    [token, showToast]
  );

  const pull = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return (
    <View className="flex-1 bg-surface">
      <View
        className="flex-row items-center gap-2 border-b border-hairline px-4 pb-3"
        style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={8}
          className="-ml-2 p-2 active:opacity-60">
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={18}
            tintColor={theme.text}
          />
        </Pressable>
        <Text className="flex-1 font-heading-bold text-xl leading-7 text-ink">Alerts</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={theme.textSecondary} />
        </View>
      ) : (
        <FlatList
          data={invitations}
          keyExtractor={(invitation) => invitation.id}
          contentContainerClassName="w-full max-w-[800px] self-center gap-3 px-4"
          contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={theme.primary} />
          }
          renderItem={({ item }) => (
            <View className="rounded-3xl bg-surface-card px-4 py-4">
              <View className="flex-row items-center gap-3">
                <CircleBadge
                  initial={item.circle?.icon_initial ?? '?'}
                  color={item.circle?.color_hex ?? '#94A3B8'}
                />
                <View className="flex-1">
                  <Text className="font-sans text-[15px] leading-[21px] text-ink">
                    <Text className="font-body-semibold">
                      {item.inviter?.full_name ?? 'Someone'}
                    </Text>
                    {' invited you to '}
                    <Text className="font-body-semibold">{item.circle?.name ?? 'a circle'}</Text>
                  </Text>
                  <Text className="mt-0.5 font-sans text-[12px] leading-4 text-ink-muted">
                    {timeAgo(item.created_at)}
                  </Text>
                </View>
              </View>

              {busyId === item.id ? (
                <View className="mt-3 items-center py-2">
                  <ActivityIndicator size="small" color={theme.textSecondary} />
                </View>
              ) : (
                <View className="mt-3 flex-row gap-2.5">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Accept invitation to ${item.circle?.name ?? 'circle'}`}
                    onPress={() => void respond(item, true)}
                    className="flex-1 items-center rounded-full py-2.5 active:opacity-85"
                    style={{ backgroundColor: theme.primary }}>
                    <Text
                      className="font-body-semibold text-[14px] leading-5"
                      style={{ color: theme.onPrimary }}>
                      Accept
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Decline invitation to ${item.circle?.name ?? 'circle'}`}
                    onPress={() => void respond(item, false)}
                    className="flex-1 items-center rounded-full bg-surface-selected py-2.5 active:opacity-70">
                    <Text className="font-body-semibold text-[14px] leading-5 text-ink">
                      Decline
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center gap-2 rounded-3xl bg-surface-card px-5 py-12">
              <SymbolView
                name={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
                size={24}
                tintColor={theme.textSecondary}
              />
              <Text className="text-center font-body-semibold text-base leading-6 text-ink">
                {error ? 'Could not load your alerts' : 'Nothing waiting on you'}
              </Text>
              <Text className="text-center font-sans text-sm leading-5 text-ink-muted">
                {error ?? 'Circle invitations show up here, with cheers and replies to follow.'}
              </Text>
              {error ? (
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
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}
