import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import type { PostVisibility } from '@/lib/posts';

export type AudienceCircle = { id: string; name: string };

/**
 * The audiences, widest first.
 *
 * Public sits at the top because it is the one worth reading twice before
 * picking — a win shared openly cannot be un-read once somebody has seen it.
 */
const AUDIENCES: {
  value: PostVisibility;
  label: string;
  hint: string;
  icon: SymbolViewProps['name'];
}[] = [
  {
    value: 'public',
    label: 'Public',
    hint: 'Anyone on Welle',
    icon: { ios: 'globe', android: 'public', web: 'public' },
  },
  {
    value: 'all_circles',
    label: 'All circles',
    // Replaced with the real count where it is drawn.
    hint: 'Members of your circles',
    icon: { ios: 'person.2', android: 'group', web: 'group' },
  },
  {
    value: 'custom',
    label: 'Choose circles',
    hint: 'Only the ones you pick',
    icon: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' },
  },
];

const CHECKED = { ios: 'checkmark.square.fill', android: 'check_box', web: 'check_box' } as const;
const UNCHECKED = {
  ios: 'square',
  android: 'check_box_outline_blank',
  web: 'check_box_outline_blank',
} as const;
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
 * Who a win is for.
 *
 * A circle is an audience rather than another wall to appear on: a win shared
 * into one is served to its members and to nobody else. One post reaches every
 * circle picked, so nobody sees it twice for being in more than one of them.
 *
 * Shared by the share flow and the edit screen so the two cannot drift — the
 * choice means the same thing whichever one made it.
 */
export function AudiencePicker({
  circles,
  visibility,
  onChangeVisibility,
  chosenCircleIds,
  onToggleCircle,
}: {
  /** Every circle the author could share into. */
  circles: AudienceCircle[];
  visibility: PostVisibility;
  onChangeVisibility: (visibility: PostVisibility) => void;
  chosenCircleIds: string[];
  onToggleCircle: (id: string) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="font-body-semibold text-[13px] leading-[18px] text-ink-muted">
        Who can see this
      </Text>

      {AUDIENCES.map((audience) => {
        // With no circles to reach, either circle option is a dead end.
        if (audience.value !== 'public' && circles.length === 0) return null;

        const chosen = visibility === audience.value;

        return (
          <Pressable
            key={audience.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: chosen }}
            accessibilityLabel={audience.label}
            onPress={() => onChangeVisibility(audience.value)}
            className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3.5 active:opacity-85 ${
              chosen ? 'border-primary bg-primary/5' : 'border-transparent bg-surface-card'
            }`}>
            <SymbolView
              name={audience.icon}
              size={16}
              tintColor={chosen ? Colors.light.primary : Colors.light.textSecondary}
            />

            <View className="flex-1">
              <Text className="font-body-semibold text-[14px] leading-5 text-ink">
                {audience.label}
              </Text>
              <Text className="mt-0.5 font-sans text-[12px] leading-4 text-ink-muted">
                {audience.value === 'all_circles'
                  ? `Members of your ${circles.length} circle${circles.length === 1 ? '' : 's'}`
                  : audience.hint}
              </Text>
            </View>

            <SymbolView
              name={chosen ? SELECTED : UNSELECTED}
              size={18}
              tintColor={chosen ? Colors.light.primary : Colors.light.textSecondary}
            />
          </Pressable>
        );
      })}

      {/* The circles themselves, only once there is a reason to show them. */}
      {visibility === 'custom' && circles.length > 0 ? (
        <View className="mt-1 gap-1.5 rounded-2xl bg-surface-card px-2 py-2">
          {circles.map((circle) => {
            const picked = chosenCircleIds.includes(circle.id);

            return (
              <Pressable
                key={circle.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: picked }}
                accessibilityLabel={circle.name}
                onPress={() => onToggleCircle(circle.id)}
                className="flex-row items-center gap-3 rounded-xl px-3 py-2.5 active:opacity-85">
                <SymbolView
                  name={picked ? CHECKED : UNCHECKED}
                  size={18}
                  tintColor={picked ? Colors.light.primary : Colors.light.textSecondary}
                />
                <Text className="flex-1 font-sans text-[14px] leading-5 text-ink">
                  {circle.name}
                </Text>
              </Pressable>
            );
          })}

          {chosenCircleIds.length === 0 ? (
            <Text className="px-3 pb-1 pt-0.5 font-sans text-[12px] leading-4 text-ink-muted">
              Pick at least one circle to share with.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
