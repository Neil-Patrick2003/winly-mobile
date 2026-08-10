import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * Placeholder body for a tab whose real content does not exist yet. Keeps the
 * empty tabs looking deliberate instead of blank, and gives each one an obvious
 * place to be replaced.
 */
export function ScreenScaffold({
  icon,
  title,
  subtitle,
}: {
  icon: SymbolViewProps['name'];
  title: string;
  subtitle: string;
}) {
  return (
    // No top inset — the shared header above already owns the safe area.
    <View className="flex-1 items-center justify-center gap-3 bg-surface px-10">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-surface-selected">
        <SymbolView name={icon} size={26} tintColor={Colors.light.textSecondary} />
      </View>
      <Text className="text-center font-heading-bold text-xl leading-7 text-ink">{title}</Text>
      <Text className="text-center font-sans text-sm leading-5 text-ink-muted">{subtitle}</Text>
    </View>
  );
}
