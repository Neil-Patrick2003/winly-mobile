import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

/**
 * Reached from the header. A placeholder — messaging is not built yet, but the
 * route has to exist for the header's typed link to resolve.
 */
export default function MessagesScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-surface" style={{ paddingTop: insets.top }}>
      <View className="w-full max-w-[800px] flex-1 self-center px-6">
        <View className="flex-row items-center gap-2 pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            hitSlop={8}
            className="-ml-2 p-2 active:opacity-60">
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              size={18}
              tintColor={Colors.light.text}
            />
          </Pressable>
          <Text className="font-heading-bold text-xl leading-7 text-ink">Messages</Text>
        </View>

        <Text className="pt-6 font-sans text-sm leading-5 text-ink-muted">
          Conversations with the people you follow will live here.
        </Text>
      </View>
    </View>
  );
}
