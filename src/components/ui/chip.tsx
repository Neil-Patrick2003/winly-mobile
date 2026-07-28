import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, Text } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * A selectable pill. Used for meditation categories, which scroll horizontally,
 * and movement activities, which wrap — so it sizes to its content and leaves
 * the layout to the caller.
 *
 * The selected colours are passed in rather than read from a token: each step
 * of the Share flow carries its own accent (see `PILLAR_THEME`).
 */
export function Chip({
  label,
  selected,
  accent,
  tint,
  icon,
  onPress,
}: {
  label: string;
  selected: boolean;
  /** Text and border once selected. */
  accent: string;
  /** Fill once selected. */
  tint: string;
  icon?: SymbolViewProps['name'];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`flex-row items-center gap-2 rounded-full border px-4 py-3 active:opacity-70 ${
        selected ? '' : 'border-hairline bg-surface-card'
      }`}
      style={selected ? { backgroundColor: tint, borderColor: accent } : undefined}>
      {icon ? (
        <SymbolView
          name={icon}
          size={16}
          tintColor={selected ? accent : Colors.light.textSecondary}
        />
      ) : null}
      <Text
        className="font-body-semibold text-[15px] leading-5"
        style={{ color: selected ? accent : Colors.light.text }}>
        {label}
      </Text>
    </Pressable>
  );
}
