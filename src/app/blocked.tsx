import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImageWithPlaceholder } from '@/components/ui/image';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useFeed } from '@/lib/feed-context';
import { fetchBlockedUsers, unblockUser } from '@/lib/moderation';
import { goBack } from '@/lib/navigation';
import type { UserSummary } from '@/lib/stories';
import { useToast } from '@/lib/toast';

/**
 * Everyone you have blocked, from Settings, with a way to unblock each.
 *
 * Unblocking does not bring back follows; that has to be done again by hand.
 */
export default function BlockedAccountsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const showToast = useToast();
  const { refresh } = useFeed();

  const [people, setPeople] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setPeople(await fetchBlockedUsers(token));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your blocked accounts.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!cancelled) await load();
      })();
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  const unblock = async (person: UserSummary) => {
    if (!token) return;
    setBusyId(person.id);
    try {
      await unblockUser(person.id, token);
      setPeople((current) => current.filter((each) => each.id !== person.id));
      showToast(`Unblocked ${person.full_name}`);
      void refresh();
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'Could not unblock them. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View className="flex-1 bg-surface" style={{ paddingTop: insets.top }}>
      <View className="w-full max-w-[800px] flex-1 self-center px-4">
        <View className="flex-row items-center gap-2 pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => goBack('/settings')}
            hitSlop={8}
            className="-ml-2 p-2 active:opacity-60">
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              size={18}
              tintColor={Colors.light.text}
            />
          </Pressable>
          <Text className="font-heading-bold text-xl leading-7 text-ink">Blocked accounts</Text>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="small" color={Colors.light.textSecondary} />
          </View>
        ) : (
          <FlatList
            data={people}
            keyExtractor={(person) => person.id}
            contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 24 }}
            ListEmptyComponent={
              <Text className="pt-2 font-sans text-sm leading-5 text-ink-muted">
                {error ??
                  "You haven't blocked anyone. You can block someone from the ... menu on their posts, comments or profile."}
              </Text>
            }
            ItemSeparatorComponent={() => <View className="h-2" />}
            renderItem={({ item }) => (
              <View className="flex-row items-center gap-3 rounded-lg bg-surface-card p-3">
                <ImageWithPlaceholder
                  source={{ uri: item.avatar_url }}
                  className="h-10 w-10 rounded-full"
                  accessibilityLabel={`${item.full_name} profile photo`}>
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-primary">
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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Unblock ${item.full_name}`}
                  disabled={busyId === item.id}
                  onPress={() => void unblock(item)}
                  className="min-w-[88px] items-center rounded-full border border-hairline px-4 py-2 active:opacity-70">
                  {busyId === item.id ? (
                    <ActivityIndicator size="small" color={Colors.light.textSecondary} />
                  ) : (
                    <Text className="font-body-semibold text-[14px] leading-5 text-ink">
                      Unblock
                    </Text>
                  )}
                </Pressable>
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}
