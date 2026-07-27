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
      className="p-2 active:opacity-60">
      <SymbolView name={icon} size={22} tintColor={Colors.light.text} />
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
    <View
      className="border-b border-hairline bg-surface-card px-4 pb-2"
      style={{ paddingTop: insets.top + 6 }}>
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

        <View className="flex-row items-center">
          <HeaderAction
            icon={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
            label="Notifications"
            onPress={() => router.push('/notifications')}
          />
          <HeaderAction
            icon={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
            label="Settings"
            onPress={() => router.push('/settings')}
          />
        </View>
      </View>
    </View>
  );
}
