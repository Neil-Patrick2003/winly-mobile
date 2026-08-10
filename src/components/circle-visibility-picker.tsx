import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const SELECTED = {
  ios: 'largecircle.fill.circle',
  android: 'radio_button_checked',
  web: 'radio_button_checked',
} as const;
const UNSELECTED = {
  ios: 'circle',
  android: 'radio_button_unchecked',
  web: 'radio_button_unchecked',
} as const;

/**
 * The two kinds, open one first.
 *
 * Public leads because it is what almost every circle wants to be and what
 * every circle made before this choice existed already is — a form whose first
 * option is the ordinary one is a form most people can leave alone.
 */
const OPTIONS: {
  private: boolean;
  label: string;
  hint: string;
  icon: SymbolViewProps['name'];
}[] = [
  {
    private: false,
    label: 'Public',
    hint: 'Anyone can find it in Discover and join.',
    icon: { ios: 'globe', android: 'public', web: 'public' },
  },
  {
    private: true,
    label: 'Private',
    // Said in terms of what somebody outside experiences, because that is the
    // whole of what private means here — there is no separate request-to-join.
    hint: 'Hidden from Discover and search. People join by invitation.',
    icon: { ios: 'lock', android: 'lock', web: 'lock' },
  },
];

/**
 * Who can find a circle.
 *
 * Shared by the form that starts a circle and the one that changes it, so the
 * choice reads the same in both — and so it keeps meaning the same thing, which
 * two copies of these sentences would not.
 *
 * It governs being *found*, not being read: a private circle is left out of
 * Discover and out of search, and the ways in are an invitation or a link from
 * somebody already inside. Turning a public circle private later does not turn
 * anybody out — what is on the wall was shared with the people who are there.
 */
export function CircleVisibilityPicker({
  isPrivate,
  onChange,
  disabled = false,
}: {
  isPrivate: boolean;
  onChange: (isPrivate: boolean) => void;
  /** Set while a save is in flight, as the text boxes are. */
  disabled?: boolean;
}) {
  const theme = useTheme();

  return (
    <View className="mt-5">
      <Text className="font-body-semibold text-[13px] leading-[18px] text-ink-muted">
        Who can find it
      </Text>

      <View className="mt-2 gap-2">
        {OPTIONS.map((option) => {
          const chosen = option.private === isPrivate;

          return (
            <Pressable
              key={option.label}
              accessibilityRole="radio"
              accessibilityState={{ selected: chosen, disabled }}
              accessibilityLabel={option.label}
              accessibilityHint={option.hint}
              disabled={disabled}
              onPress={() => onChange(option.private)}
              className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3.5 active:opacity-85 ${
                chosen ? 'bg-primary/5' : 'border-hairline bg-surface-card'
              } ${disabled ? 'opacity-60' : ''}`}
              style={chosen ? { borderColor: theme.primary } : undefined}>
              <SymbolView
                name={option.icon}
                size={16}
                tintColor={chosen ? theme.primary : theme.textSecondary}
              />

              <View className="flex-1">
                <Text className="font-body-semibold text-[14px] leading-5 text-ink">
                  {option.label}
                </Text>
                <Text className="mt-0.5 font-sans text-[12px] leading-4 text-ink-muted">
                  {option.hint}
                </Text>
              </View>

              <SymbolView
                name={chosen ? SELECTED : UNSELECTED}
                size={18}
                tintColor={chosen ? theme.primary : theme.textSecondary}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
