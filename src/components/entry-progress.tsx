import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { PILLAR_ORDER, type Pillar } from '@/lib/entry-draft';

const LABEL: Record<Pillar, string> = {
  meditation: 'Meditation',
  learning: 'Learning',
  movement: 'Movement',
};

/**
 * Leave the whole ESC flow and return to the tabs, from any pillar.
 *
 * The flow is a nested stack inside a modal, so `dismissAll()` alone only pops
 * the inner stack back to Meditation — the modal stays open. Popping to that
 * single inner route first, then `dismiss()` (which closes the entire stack
 * when called from its only route), tears the modal down in one gesture.
 */
export function dismissEntryFlow() {
  router.dismissAll();
  router.dismiss();
}

/**
 * Top bar shared by the three pillar screens: back, a three-segment progress
 * strip labelled with the pillars, and a close that dismisses the whole flow.
 *
 * `onBack` is supplied per screen — Meditation steps backward through its own
 * sub-steps before leaving, whereas Learning and Movement just pop.
 */
export function EntryProgress({ active, onBack }: { active: Pillar; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const activeIndex = PILLAR_ORDER.indexOf(active);

  return (
    <View
      className="border-b border-hairline bg-surface-card px-2 pb-3"
      style={{ paddingTop: insets.top + 6 }}>
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={8}
          className="p-2 active:opacity-60">
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={22}
            tintColor={Colors.light.text}
          />
        </Pressable>

        <Text className="flex-1 text-center font-heading-bold text-[15px] leading-5 text-ink">
          Share your daily ESC
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={dismissEntryFlow}
          hitSlop={8}
          className="p-2 active:opacity-60">
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={20}
            tintColor={Colors.light.textSecondary}
          />
        </Pressable>
      </View>

      <View className="mt-1 w-full max-w-[800px] flex-row gap-2 self-center px-1">
        {PILLAR_ORDER.map((pillar, i) => {
          const done = i < activeIndex;
          const current = i === activeIndex;
          return (
            <View key={pillar} className="flex-1 gap-1">
              <View
                className={`h-1.5 rounded-full ${
                  done || current ? 'bg-primary' : 'bg-surface-selected'
                }`}
              />
              <Text
                className={`text-[11px] leading-[13px] ${
                  current ? 'font-body-semibold text-primary' : 'font-sans text-ink-muted'
                }`}>
                {LABEL[pillar]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
