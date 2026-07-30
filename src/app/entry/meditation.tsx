import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

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
import { formatClock, formatDuration, MEDITATION_DURATIONS } from '@/lib/meditation';
import { goBack } from '@/lib/navigation';

const THEME = PILLAR_THEME.meditation;

/**
 * Step 1. How long you sat, and — if you would rather sit now than log a
 * session already done — a countdown to sit against.
 *
 * The timer is optional on purpose: most entries are written afterwards, and
 * making people run a clock they do not need would cost the step its speed.
 */
export default function MeditationStepScreen() {
  const { draft, patchMeditation } = useEntryDraft();
  const { minutes, usedTimer } = draft.meditation;

  const [remaining, setRemaining] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  // Changing the length restarts the clock rather than carrying a stale count
  // over from the previous choice.
  useEffect(() => {
    setRemaining(minutes === null ? null : minutes * 60);
    setRunning(false);
  }, [minutes]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(
      () => setRemaining((value) => (value === null ? null : Math.max(0, value - 1))),
      1000
    );
    return () => clearInterval(timer);
  }, [running]);

  // Sitting the clock out is the strongest possible signal that it happened, so
  // reaching zero logs the step for them.
  useEffect(() => {
    if (running && remaining === 0) {
      setRunning(false);
      patchMeditation({ completed: true, usedTimer: true });
    }
  }, [running, remaining, patchMeditation]);

  // A length is the whole point of the step, so nothing moves forward without
  // one — except Skip, which says the sitting did not happen. Choosing a length
  // *is* logging the sit now that there is no separate button to confirm it, so
  // Next is the only gate.
  const hasInput = minutes !== null;
  const timerOpen = usedTimer;

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
              // Picking one logs the sit outright, unless the timer is open: a
              // countdown that has not finished is a sit still in progress.
              onPress={() =>
                patchMeditation(
                  value === minutes
                    ? { minutes: null, usedTimer: false, completed: false }
                    : { minutes: value, completed: !usedTimer }
                )
              }
            />
          ))}
        </View>

        {minutes !== null ? (
          <View className="mt-5 gap-4 rounded-3xl p-4" style={{ backgroundColor: THEME.panel }}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: timerOpen }}
              accessibilityLabel="Use a timer"
              // Reaching for the timer means the sitting is about to happen
              // rather than already has, so the win goes back to incomplete
              // until the countdown runs out. Turning it off is the reverse:
              // they are logging a session they already did.
              onPress={() => patchMeditation({ usedTimer: !usedTimer, completed: usedTimer })}
              className="flex-row items-center gap-3 active:opacity-70">
              <View
                className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
                  timerOpen ? '' : 'bg-surface-card'
                }`}
                style={{
                  borderColor: THEME.accent,
                  backgroundColor: timerOpen ? THEME.accent : undefined,
                }}>
                {timerOpen ? (
                  <SymbolView
                    name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                    size={13}
                    weight="bold"
                    tintColor="#FFFFFF"
                  />
                ) : null}
              </View>
              <View className="flex-1">
                <Text className="font-body-semibold text-[15px] leading-5 text-ink">
                  Use a timer
                </Text>
                <Text className="mt-0.5 font-sans text-[13px] leading-[18px] text-ink-muted">
                  Sit for {formatDuration(minutes)} now, and we&rsquo;ll count it down.
                </Text>
              </View>
            </Pressable>

            {timerOpen ? (
              <View className="items-center gap-4 rounded-2xl bg-surface-card px-4 py-6">
                <Text
                  className="font-heading-bold text-[44px] leading-[52px]"
                  style={{ color: THEME.accent }}>
                  {formatClock(remaining ?? minutes * 60)}
                </Text>

                <View className="flex-row gap-3">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setRunning((value) => !value)}
                    className="flex-row items-center gap-2 rounded-full px-6 py-3 active:opacity-85"
                    style={{ backgroundColor: THEME.accent }}>
                    <SymbolView
                      name={
                        running
                          ? {
                              ios: 'pause.fill',
                              android: 'pause',
                              web: 'pause',
                            }
                          : {
                              ios: 'play.fill',
                              android: 'play_arrow',
                              web: 'play_arrow',
                            }
                      }
                      size={15}
                      tintColor="#FFFFFF"
                    />
                    <Text className="font-body-semibold text-[15px] leading-5 text-white">
                      {running ? 'Pause' : remaining === minutes * 60 ? 'Start' : 'Resume'}
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setRunning(false);
                      setRemaining(minutes * 60);
                    }}
                    className="rounded-full border border-hairline px-6 py-3 active:opacity-70">
                    <Text className="font-body-semibold text-[15px] leading-5 text-ink">Reset</Text>
                  </Pressable>
                </View>

                <Text className="text-center font-sans text-[13px] leading-[18px] text-ink-muted">
                  {remaining === 0
                    ? 'Done — logged for you.'
                    : 'Keep this screen open while the timer runs. Move on before it ends and the sit is shared as stopped early.'}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

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
