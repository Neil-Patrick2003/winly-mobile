import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
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
import { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import {
  acceptInvitation,
  declineInvitation,
  fetchInvitations,
  type CircleInvitation,
} from '@/lib/circles';
import {
  fetchNotifications,
  markNotificationsRead,
  type AppNotification,
} from '@/lib/notifications';
import { ImageWithPlaceholder } from '@/components/ui/image';
import { timeAgo } from '@/lib/time';
import { useLiveNotifications } from '@/lib/use-live-notifications';
import { useToast } from '@/lib/toast';
import { goBack } from '@/lib/navigation';

const AVATAR = 44;

/** What a notification's icon says about it, per kind. */
const KIND = {
  follow: {
    icon: { ios: 'person.fill.badge.plus', android: 'person_add', web: 'person_add' },
    tint: '#609BF1',
  },
  like: { icon: { ios: 'camera.macro', android: 'local_florist', web: 'local_florist' }, tint: '#E5484D' },
  comment: {
    icon: { ios: 'bubble.right.fill', android: 'chat_bubble', web: 'chat_bubble' },
    tint: '#60BC88',
  },
} as const;

/**
 * One thing that happened, and the way back to it.
 *
 * Where a tap lands is decided by what the notification is about, not by its
 * wording: a follow has no post and opens the person, everything else opens the
 * post it happened to.
 */
function NotificationRow({
  item,
  onOpen,
}: {
  item: AppNotification;
  /** Settle this row as read the moment it is acted on. */
  onOpen: (id: string) => void;
}) {
  const kind = KIND[item.type as keyof typeof KIND];

  const open = () => {
    onOpen(item.id);

    if (item.post_id) {
      router.push({ pathname: '/comments/[postId]', params: { postId: item.post_id } });
      return;
    }
    if (item.actor) {
      router.push({ pathname: '/users/[userId]', params: { userId: item.actor.id } });
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.message}
      onPress={open}
      className={`flex-row items-center gap-3 rounded-3xl px-4 py-3.5 active:opacity-70 ${
        item.is_read ? 'bg-surface-card' : 'bg-surface-selected'
      }`}>
      <View>
        <ImageWithPlaceholder
          source={{ uri: item.actor?.avatar_url ?? null }}
          className="rounded-full"
          size={AVATAR}
          accessibilityLabel={`${item.actor?.full_name ?? 'Someone'} profile photo`}>
          <View
            className="items-center justify-center rounded-full bg-primary"
            style={{ width: AVATAR, height: AVATAR }}>
            <Text className="font-heading-bold text-base leading-6 text-white">
              {(item.actor?.full_name.trim()[0] ?? '?').toUpperCase()}
            </Text>
          </View>
        </ImageWithPlaceholder>

        {/* The kind, as a badge on the avatar — so the row reads at a glance
            without parsing the sentence. */}
        {kind ? (
          <View
            className="absolute -bottom-0.5 -right-0.5 h-5 w-5 items-center justify-center rounded-full border-2 border-surface"
            style={{ backgroundColor: kind.tint }}>
            <SymbolView name={kind.icon} size={9} weight="bold" tintColor="#FFFFFF" />
          </View>
        ) : null}
      </View>

      <View className="flex-1">
        <Text className="font-sans text-[15px] leading-[21px] text-ink">{item.message}</Text>
        <Text className="mt-0.5 font-sans text-[12px] leading-4 text-ink-muted">
          {timeAgo(item.created_at)}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Alerts.
 *
 * Two kinds of thing share the screen. Invitations sit on top because they wait
 * on an answer; everything below them is a report of something that already
 * happened and only needs a way back to it.
 *
 * Opening the screen marks everything read — the badge answers "is there
 * anything new", and this is the answer to it. The rows stay, because the list
 * is also the record of who did what.
 */
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { token } = useAuth();
  const showToast = useToast();

  const [invitations, setInvitations] = useState<CircleInvitation[]>([]);
  const [alerts, setAlerts] = useState<AppNotification[]>([]);
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
        /*
         * Both lists in parallel. Invitations are not paginated alongside the
         * notifications — they are a short list that waits on an answer, and
         * the cursor below belongs to the notifications, which is the side
         * that actually grows.
         */
        const [page, invites] = await Promise.all([
          fetchNotifications(token, reset ? undefined : (cursor.current ?? undefined)),
          reset ? fetchInvitations(token) : Promise.resolve(null),
        ]);

        cursor.current = page.meta.next_cursor;
        atEnd.current = page.meta.next_cursor === null;
        failed.current = false;
        setError(null);

        if (invites) setInvitations(invites.data);

        setAlerts((previous) => {
          if (reset) return page.data;

          const seen = new Set(previous.map((row) => row.id));
          return previous.concat(page.data.filter((row) => !seen.has(row.id)));
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

  /*
   * A notification arriving over the socket goes straight to the top.
   *
   * Guarded against one already present: the list may have been fetched a
   * moment after the broadcast was sent, and a duplicate key is a hard error.
   */
  useLiveNotifications(
    useCallback((arrived: AppNotification) => {
      setAlerts((previous) =>
        previous.some((row) => row.id === arrived.id) ? previous : [arrived, ...previous]
      );
    }, [])
  );

  /** Settle one row locally, so acting on it shows immediately. */
  const markOneRead = useCallback((id: string) => {
    setAlerts((previous) =>
      previous.map((row) => (row.id === id ? { ...row, is_read: true } : row))
    );
  }, []);

  /*
   * Re-read on every arrival, not just the first.
   *
   * Opening the list clears the badge server-side, but the rows keep their
   * unread tint so you can still see what was new. Coming back from whatever
   * a row opened is the moment that stops being useful — so the list is
   * fetched again and everything settles to what the server now says, without
   * anybody having to pull to refresh.
   */
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        await refresh();
        if (!cancelled) setLoading(false);
        if (token) await markNotificationsRead(token).catch(() => undefined);
      })();
      return () => {
        cancelled = true;
      };
    }, [refresh, token])
  );

  const loadMore = useCallback(async () => {
    if (atEnd.current || inFlight.current || failed.current) return;
    await load(false);
  }, [load]);

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
          onPress={() => goBack()}
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
          data={alerts}
          keyExtractor={(row) => row.id}
          contentContainerClassName="w-full max-w-[800px] self-center gap-3 px-4"
          contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={theme.primary} />
          }
          renderItem={({ item }) => <NotificationRow item={item} onOpen={markOneRead} />}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          /* Above the reports, because an invitation is the only thing here
             that is waiting on you. */
          ListHeaderComponent={
            invitations.length > 0 ? (
              <View className="gap-3 pb-1">
                {invitations.map((item) => (
                  <View key={item.id} className="rounded-3xl bg-surface-card px-4 py-4">
                    <View className="flex-row items-center gap-3">
                      <CircleBadge
                        initial={item.circle?.icon_initial ?? '?'}
                        color={item.circle?.color_hex ?? Colors.light.textSecondary}
                      />
                      <View className="flex-1">
                        <Text className="font-sans text-[15px] leading-[21px] text-ink">
                          <Text className="font-body-semibold">
                            {item.inviter?.full_name ?? 'Someone'}
                          </Text>
                          {' invited you to '}
                          <Text className="font-body-semibold">
                            {item.circle?.name ?? 'a circle'}
                          </Text>
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
                ))}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View className="items-center gap-2 rounded-3xl bg-surface-card px-5 py-12">
              <SymbolView
                name={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
                size={24}
                tintColor={theme.textSecondary}
              />
              <Text className="text-center font-body-semibold text-base leading-6 text-ink">
                {error ? 'Could not load your alerts' : 'Nothing new'}
              </Text>
              <Text className="text-center font-sans text-sm leading-5 text-ink-muted">
                {error ??
                  'Follows, cheers and replies show up here, along with circle invitations.'}
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
