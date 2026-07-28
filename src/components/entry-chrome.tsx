import { router, useNavigation } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { PILLAR_ORDER, type Pillar } from '@/lib/entry-draft';

/**
 * The dark navy that carries the flow's forward controls — "Let's go", "Next",
 * "Review". Deliberately not the brand green: inside the flow, green means
 * "this pillar is done", so the step controls stay neutral.
 */
export const NAVY = '#2E354E';

/**
 * Per-pillar accents. These sit outside the palette in constants/theme.ts on
 * purpose — the three pillars have to read as distinct steps, which a single
 * brand colour cannot do. Sampled from the design.
 */
export const PILLAR_THEME: Record<
  Pillar,
  {
    label: string;
    icon: SymbolViewProps['name'];
    /** The skip link, selected chip text, the timer's own controls. */
    accent: string;
    /** Icon chip behind the pillar glyph, and selected fills. */
    tint: string;
    /** The larger panel behind an expanded session, and the intro rows. */
    panel: string;
  }
> = {
  meditation: {
    label: 'Meditation',
    icon: {
      ios: 'figure.mind.and.body',
      android: 'self_improvement',
      web: 'self_improvement',
    },
    accent: '#946FF0',
    tint: '#EEE9FD',
    panel: '#F8F6FE',
  },
  learning: {
    label: 'Learning',
    icon: { ios: 'book', android: 'menu_book', web: 'menu_book' },
    accent: '#E6AC49',
    tint: '#FDF3E4',
    panel: '#FEF8EF',
  },
  movement: {
    label: 'Movement',
    icon: {
      ios: 'figure.run',
      android: 'directions_run',
      web: 'directions_run',
    },
    accent: '#609BF1',
    tint: '#EAF1FE',
    panel: '#F0F6FE',
  },
};

/**
 * Leave the whole flow and return to the tabs, from any step.
 *
 * The flow is a nested stack inside a modal, so closing it means popping the
 * modal's *parent* — the root stack — in one go. Unwinding the inner stack
 * first does not work: `dismissAll()` dispatches POP_TO_TOP, which the inner
 * stack cannot handle while it holds a single route (pressing X on the intro),
 * so it bubbles to the root stack and tears the tabs down with it. The
 * `dismiss()` that followed then had nothing left to pop, which is where
 * "action POP was not handled by any navigator" came from.
 */
export function useDismissEntryFlow() {
  const navigation = useNavigation();

  return useCallback(() => {
    const parent = navigation.getParent();
    // The parent is the root stack, and `entry` is a route on it, so one
    // goBack closes the modal no matter how deep the flow has gone.
    if (parent) parent.goBack();
    else router.back();
  }, [navigation]);
}

/**
 * Title bar and standing subtitle, on every screen of the flow. There is no
 * back control here — stepping backward is the footer's job, and the close
 * button is the only way out.
 */
export function EntryHeader() {
  const insets = useSafeAreaInsets();
  const dismissFlow = useDismissEntryFlow();

  return (
    <View className="bg-surface-card" style={{ paddingTop: insets.top + 6 }}>
      <View className="flex-row items-center gap-2 border-b border-hairline px-4 pb-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={dismissFlow}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface active:opacity-60">
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={15}
            weight="medium"
            tintColor={Colors.light.text}
          />
        </Pressable>

        <Text className="flex-1 text-center font-heading-bold text-[17px] leading-6 text-ink">
          Share your small win
        </Text>

        {/* Balances the close button so the title stays optically centred. */}
        <View className="h-9 w-9" />
      </View>

      <Text className="px-8 pt-4 text-center font-sans text-[15px] leading-[22px] text-ink-muted">
        Celebrate the extra care you gave yourself today — no win is too small.
      </Text>
    </View>
  );
}

/**
 * Three-segment progress strip, labelled with the pillars. Segments fill as the
 * flow advances, so the current one and everything behind it read as covered.
 */
export function StepIndicator({ active }: { active: Pillar }) {
  const activeIndex = PILLAR_ORDER.indexOf(active);

  return (
    <View className="flex-row gap-2 px-1">
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
              {PILLAR_THEME[pillar].label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Tinted glyph, pillar name, and a line on what the step wants. */
export function PillarHeading({ pillar, subtitle }: { pillar: Pillar; subtitle: string }) {
  const theme = PILLAR_THEME[pillar];

  return (
    <View className="flex-row items-center gap-3.5">
      <View
        className="h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: theme.tint }}>
        <SymbolView name={theme.icon} size={26} tintColor={theme.accent} />
      </View>
      <View className="flex-1">
        <Text className="font-heading-bold text-xl leading-7 text-ink">{theme.label}</Text>
        <Text className="mt-0.5 font-sans text-sm leading-5 text-ink-muted">{subtitle}</Text>
      </View>
    </View>
  );
}

/**
 * Passes over the pillar entirely — moves to the next step *without* marking it
 * done. Skipping says it did not happen today; filling the step in is what says
 * it did, so the two controls never overlap.
 */
export function SkipLink({ pillar, onPress }: { pillar: Pillar; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Skip this part"
      onPress={onPress}
      className="items-center py-1 active:opacity-60">
      <Text
        className="font-body-semibold text-[15px] leading-5"
        style={{ color: PILLAR_THEME[pillar].accent }}>
        Skip this part
      </Text>
    </Pressable>
  );
}

/**
 * Back and forward, pinned to the bottom of every step.
 *
 * A sibling of the step's ScrollView rather than an overlay, so it claims its
 * own space instead of covering the last of the content — no bottom padding to
 * keep in sync with the bar's height. Inside the KeyboardAvoidingView on the
 * typing steps, so the keyboard lifts it rather than burying it.
 */
export function StepFooter({
  onBack,
  onNext,
  nextLabel = 'Next',
  nextDisabled = false,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  /**
   * Blocks the forward control until the step has its required input. Skip is
   * the deliberate way past an empty step, and it leaves the pillar unmarked.
   */
  nextDisabled?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="bg-surface-card px-6 pt-3"
      // On a gesture-bar device the inset supplies the room below; without one,
      // 14 stands in — the same rule the tab bar uses.
      style={{ paddingBottom: Math.max(insets.bottom, 14) }}>
      <View className="w-full max-w-[800px] flex-row gap-3 self-center">
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          className="w-[30%] items-center rounded-full border border-hairline bg-surface-card py-3.5 active:opacity-70">
          <Text className="font-body-semibold text-base leading-6 text-ink">Back</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: nextDisabled }}
          disabled={nextDisabled}
          onPress={onNext}
          className={`flex-1 items-center rounded-full py-3.5 active:opacity-85 ${
            nextDisabled ? 'opacity-40' : ''
          }`}
          style={{ backgroundColor: NAVY }}>
          <Text className="font-body-semibold text-base leading-6 text-white">{nextLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}
