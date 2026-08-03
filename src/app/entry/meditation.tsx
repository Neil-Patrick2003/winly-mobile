import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import {
  EntryHeader,
  PillarHeading,
  PILLAR_THEME,
  SkipLink,
  StepFooter,
  StepIndicator,
} from '@/components/entry-chrome';
import { Chip } from '@/components/ui/chip';
import { useEntryDraft } from '@/lib/entry-draft';
import { formatDuration, MEDITATION_DURATIONS } from '@/lib/meditation';
import { goBack } from '@/lib/navigation';

const THEME = PILLAR_THEME.meditation;

/**
 * Step 1. How long you sat.
 *
 * A record of something already done, and nothing else. There was a countdown
 * here to sit against, which meant the step had two jobs — logging a sitting
 * and running one — and the second wanted the screen held open for twenty
 * minutes to do its work. Logging is the fast thing people came for.
 */
export default function MeditationStepScreen() {
  const { draft, patchMeditation } = useEntryDraft();
  const { minutes } = draft.meditation;

  // A length is the whole point of the step, so nothing moves forward without
  // one — except Skip, which says the sitting did not happen. Choosing a length
  // *is* logging the sit, so Next is the only gate.
  const hasInput = minutes !== null;

  return (
    <View className="flex-1 bg-surface-card">
      <EntryHeader />

      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center px-4"
        contentContainerStyle={{ paddingTop: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled">
        <StepIndicator active="meditation" />

        <View className="pt-7">
          <PillarHeading pillar="meditation" subtitle="How long did you meditate?" />
        </View>

        <View className="flex-row flex-wrap gap-2.5 pt-5">
          {MEDITATION_DURATIONS.map((value) => (
            <Chip
              key={value}
              label={formatDuration(value)}
              selected={value === minutes}
              accent={THEME.accent}
              tint={THEME.tint}
              // Tapping the chosen length again clears it — a mis-tap should
              // not be permanent, and there is no "none" chip to fall back to.
              // Clearing it also retracts the completion it was the basis for.
              //
              // Picking one logs the sit outright: the step records something
              // already done, so a length is the whole of the answer.
              onPress={() =>
                patchMeditation(
                  value === minutes
                    ? { minutes: null, completed: false }
                    : { minutes: value, completed: true }
                )
              }
            />
          ))}
        </View>

        <View className="pt-5">
          <SkipLink pillar="meditation" onPress={() => router.push('/entry/learning')} />
        </View>
      </ScrollView>

      <StepFooter
        onBack={() => goBack()}
        onNext={() => router.push('/entry/learning')}
        nextDisabled={!hasInput}
      />
    </View>
  );
}
