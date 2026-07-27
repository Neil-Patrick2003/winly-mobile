import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { ScopedTheme } from 'uniwind';

import { AppHeader } from '@/components/app-header';
import AppTabs from '@/components/app-tabs';

/**
 * The app proper is pinned to the light palette, like the auth flow before it,
 * so moving between them never flips the whole interface on a dark-scheme
 * device. Drop the `ScopedTheme` wrapper to let it follow the system again.
 *
 * The header sits outside the tab navigator so it stays put while the screen
 * below it changes.
 */
export default function TabsLayout() {
  return (
    <ScopedTheme theme="light">
      <StatusBar style="dark" />
      <View className="flex-1 bg-surface">
        <AppHeader />
        <AppTabs />
      </View>
    </ScopedTheme>
  );
}
