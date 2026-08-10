import { View } from 'react-native';

import { AppHeader } from '@/components/app-header';
import AppTabs from '@/components/app-tabs';

/**
 * The header sits outside the tab navigator so it stays put while the screen
 * below it changes.
 *
 * The light palette is pinned once in the root layout, so nothing here has to
 * restate it.
 */
export default function TabsLayout() {
  return (
    <View className="flex-1 bg-surface">
      <AppHeader />
      <AppTabs />
    </View>
  );
}
