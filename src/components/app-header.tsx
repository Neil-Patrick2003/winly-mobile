import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Image } from '@/components/ui/image';
import { Colors } from '@/constants/theme';

function HeaderAction({
  icon,
  label,
  onPress,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center rounded-full bg-surface-card active:opacity-60">
      <SymbolView name={icon} size={20} tintColor={Colors.light.text} />
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

  return (
    // No divider and no card fill: the header floats on the page background so
    // the white action buttons and the cards below read as the raised layer.
    <View className="bg-surface px-4 pb-2" style={{ paddingTop: insets.top + 6 }}>
      <View className="w-full max-w-[800px] flex-row items-center justify-between self-center">
        <View className="flex-row items-center gap-2">
          <Image
            source={require('@/assets/images/brand/logo.png')}
            className="h-11 w-11"
            contentFit="contain"
          />
          {/* Plain text rather than <Wordmark />: that component's coral tittle
              is positioned with offsets derived for 40px, so it cannot be
              resized to header scale without redoing the geometry.

              `font-logo-extrabold` is the real 800 face — `font-extrabold`
              would leave the 700 file in place and let Android fake the weight
              on top of it. */}
          <Text className="font-logo-extrabold text-2xl leading-8 text-ink">Winly</Text>
        </View>

        {/* Settings used to sit here; it moved to the Profile tab when the
            design gave the second slot to messages. */}
        <View className="flex-row items-center gap-2.5">
          <HeaderAction
            icon={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
            label="Notifications"
            onPress={() => router.push('/notifications')}
          />
          <HeaderAction
            icon={{ ios: 'bubble.left', android: 'chat_bubble_outline', web: 'chat_bubble_outline' }}
            label="Messages"
            onPress={() => router.push('/messages')}
          />
        </View>
      </View>
    </View>
  );
}
