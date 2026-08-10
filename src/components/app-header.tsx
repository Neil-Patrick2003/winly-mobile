import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Image } from '@/components/ui/image';
import { Colors } from '@/constants/theme';
import { useUnreadNotifications } from '@/lib/use-unread-notifications';

function HeaderAction({
  icon,
  label,
  badge = 0,
  onPress,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  /** How many are waiting. Zero draws nothing at all. */
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge > 0 ? `${label}, ${badge} new` : label}
      onPress={onPress}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center rounded-full bg-surface-card active:opacity-60">
      <SymbolView name={icon} size={20} tintColor={Colors.light.text} />

      {/* Capped, because past a point the number stops being information and
          the badge stops fitting. */}
      {badge > 0 ? (
        <View
          className="absolute -right-0.5 -top-0.5 h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface px-1"
          style={{ backgroundColor: '#E5484D' }}>
          <Text className="font-body-semibold text-[10px] leading-3 text-white">
            {badge > 9 ? '9+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Shared across every tab, so it sits outside the navigator rather than being
 * repeated per screen — the tab screens therefore do not add a top safe-area
 * inset of their own; this owns it.
 */
export function AppHeader() {
  const insets = useSafeAreaInsets();
  const { unread, clear } = useUnreadNotifications();

  return (
    // No divider and no card fill: the header floats on the page background so
    // the white action buttons and the cards below read as the raised layer.
    <View className="bg-surface px-4 pb-2" style={{ paddingTop: insets.top + 6 }}>
      <View className="w-full max-w-[800px] flex-row items-center justify-between self-center">
        <View className="flex-row items-center gap-2">
          <Image
            source={require('@/assets/images/brand/welle_logo.png')}
            className="h-11 w-11"
            contentFit="contain"
          />
          {/* Plain text rather than <Wordmark />, which is sized for the auth
              screens: this is the same letters at header scale.

              Lowercase, as the app icon sets the name — and in the brand green
              rather than ink, so the mark reads as the mark.

              `font-logo-extrabold` is the real 800 face — `font-extrabold`
              would leave the 700 file in place and let Android fake the weight
              on top of it. */}
          <Text className="font-logo-extrabold text-2xl leading-8 text-primary">welle</Text>
        </View>

        {/* Settings sits on the Profile tab, and messages have gone for now —
            so the bell is the only thing up here. */}
        <View className="flex-row items-center gap-2.5">
          <HeaderAction
            icon={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
            label="Notifications"
            badge={unread}
            onPress={() => {
              // Cleared as the screen opens rather than after it answers: the
              // list marks everything read on arrival, and a badge still
              // sitting there through the transition reads as a failed tap.
              clear();
              router.push('/notifications');
            }}
          />
        </View>
      </View>
    </View>
  );
}
