import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryProgress } from '@/components/entry-progress';
import { Accordion } from '@/components/ui/accordion';
import { TextArea } from '@/components/ui/text-area';
import { Colors } from '@/constants/theme';
import { useEntryDraft } from '@/lib/entry-draft';
import { MEDITATION_CATEGORIES } from '@/lib/meditation';

type Step = 'intro' | 'category' | 'sample' | 'complete';
const ORDER: Step[] = ['intro', 'category', 'sample', 'complete'];

const PRIMARY_BUTTON =
  'items-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500 py-3.5 active:opacity-85';

export default function MeditationFlowScreen() {
  const insets = useSafeAreaInsets();

  const { draft, patchMeditation } = useEntryDraft();
  const { categoryId, completed, notes } = draft.meditation;

  const [step, setStep] = useState<Step>('intro');

  const selected = MEDITATION_CATEGORIES.find((c) => c.id === categoryId) ?? null;
  const guidedVideo = selected?.sample.video ?? null;

  // Recreated when the chosen sample changes; native controls drive playback so
  // there is no autoplay to fight with.
  const player = useVideoPlayer(guidedVideo, (p) => {
    p.loop = false;
  });

  const index = ORDER.indexOf(step);

  const goBack = () => {
    player.pause();
    if (index === 0) {
      router.back();
      return;
    }
    setStep(ORDER[index - 1]);
  };

  const goNext = () => {
    player.pause();
    setStep(ORDER[index + 1]);
  };

  const finish = () => {
    // Meditation's slice is already in the shared draft — move on to Learning.
    player.pause();
    router.push('/entry/learning');
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <EntryProgress active="meditation" onBack={goBack} />

      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center px-6"
        contentContainerStyle={{ paddingTop: 20, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        {step === 'intro' ? (
          <View className="gap-4">
            <View className="gap-1">
              <Text className="font-heading-bold text-2xl leading-8 text-ink">
                New to meditation?
              </Text>
              <Text className="font-sans text-[15px] leading-[22px] text-ink-muted">
                No experience needed. Here&apos;s the one thing worth knowing.
              </Text>
            </View>

            <Accordion title="Do I have to do it &ldquo;right&rdquo;?" defaultOpen>
              <Text className="font-sans text-sm leading-[21px] text-ink-muted">
                No. Your mind will wander — that&apos;s expected, not a mistake. Each
                time you notice, you gently bring your attention back. That noticing
                is the practice. A few minutes is plenty to start.
              </Text>
            </Accordion>

            <Pressable accessibilityRole="button" onPress={goNext} className={`mt-2 ${PRIMARY_BUTTON}`}>
              <Text className="font-body-semibold text-base leading-6 text-white">Continue</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 'category' ? (
          <View className="gap-4">
            <View className="gap-1">
              <Text className="font-heading-bold text-2xl leading-8 text-ink">
                Pick a category
              </Text>
              <Text className="font-sans text-[15px] leading-[22px] text-ink-muted">
                Tap one to read more, then choose it. You can change this later.
              </Text>
            </View>

            <View className="gap-3">
              {MEDITATION_CATEGORIES.map((category) => {
                const isSelected = category.id === categoryId;
                return (
                  <Accordion
                    key={category.id}
                    title={category.name}
                    subtitle={category.sample.duration + ' sample'}>
                    <Text className="font-sans text-sm leading-[21px] text-ink-muted">
                      {category.blurb}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => patchMeditation({ categoryId: category.id })}
                      className={`mt-3 flex-row items-center justify-center gap-2 rounded-full py-2.5 active:opacity-80 ${
                        isSelected ? 'bg-primary' : 'border border-hairline bg-surface'
                      }`}>
                      {isSelected ? (
                        <SymbolView
                          name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                          size={15}
                          weight="bold"
                          tintColor="#FFFFFF"
                        />
                      ) : null}
                      <Text
                        className={`font-body-semibold text-sm leading-5 ${
                          isSelected ? 'text-white' : 'text-ink'
                        }`}>
                        {isSelected ? 'Selected' : 'Choose ' + category.name}
                      </Text>
                    </Pressable>
                  </Accordion>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !selected }}
              disabled={!selected}
              onPress={goNext}
              className={`mt-2 ${PRIMARY_BUTTON} ${selected ? '' : 'opacity-40'}`}>
              <Text className="font-body-semibold text-base leading-6 text-white">Continue</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 'sample' && selected ? (
          <View className="gap-4">
            <View className="gap-1">
              <Text className="font-heading-bold text-2xl leading-8 text-ink">
                Try a sample
              </Text>
              <Text className="font-sans text-[15px] leading-[22px] text-ink-muted">
                A short {selected.name.toLowerCase()} session. Not feeling it? Skip
                straight to logging.
              </Text>
            </View>

            <View className="gap-3 rounded-3xl border border-hairline bg-surface-card p-4">
              <View className="flex-row items-center gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-surface-selected">
                  <SymbolView name={selected.icon} size={22} tintColor={Colors.light.primary} />
                </View>
                <View className="flex-1">
                  <Text className="font-heading-bold text-base leading-6 text-ink">
                    {selected.sample.title}
                  </Text>
                  <Text className="font-sans text-[13px] leading-[18px] text-ink-muted">
                    {selected.sample.duration} · {guidedVideo ? 'Guided video' : 'Self-guided'}
                  </Text>
                </View>
              </View>

              <Text className="font-sans text-sm leading-[21px] text-ink-muted">
                {selected.sample.description}
              </Text>

              {guidedVideo ? (
                <VideoView
                  player={player}
                  // VideoView is a native component, not wired for className; it
                  // takes a plain style. 16:9 with a black letterbox.
                  style={{
                    width: '100%',
                    aspectRatio: 16 / 9,
                    borderRadius: 16,
                    overflow: 'hidden',
                    backgroundColor: '#000000',
                  }}
                  contentFit="contain"
                />
              ) : (
                <View className="items-center gap-2 rounded-2xl bg-surface px-4 py-8">
                  <SymbolView
                    name={{ ios: 'timer', android: 'timer', web: 'timer' }}
                    size={28}
                    tintColor={Colors.light.textSecondary}
                  />
                  <Text className="text-center font-sans text-sm leading-5 text-ink-muted">
                    Find a comfortable seat, set a timer for {selected.sample.duration}, and
                    follow the prompt above.
                  </Text>
                </View>
              )}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                patchMeditation({ completed: true });
                goNext();
              }}
              className={`mt-2 ${PRIMARY_BUTTON}`}>
              <Text className="font-body-semibold text-base leading-6 text-white">
                I did this — continue
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={goNext}
              className="items-center py-2 active:opacity-60">
              <Text className="font-body-semibold text-sm leading-5 text-ink-muted">
                Skip sample
              </Text>
            </Pressable>
          </View>
        ) : null}

        {step === 'complete' ? (
          <View className="gap-4">
            <View className="gap-1">
              <Text className="font-heading-bold text-2xl leading-8 text-ink">
                Log your meditation
              </Text>
              <Text className="font-sans text-[15px] leading-[22px] text-ink-muted">
                {selected ? selected.name : 'Meditation'} · optional notes below.
              </Text>
            </View>

            <View className="flex-row items-center justify-between gap-4 rounded-2xl border border-hairline bg-surface-card px-4 py-3">
              <Text className="flex-1 font-sans text-[15px] leading-5 text-ink">
                I completed a session
              </Text>
              <Switch
                value={completed}
                onValueChange={(v) => patchMeditation({ completed: v })}
                accessibilityLabel="I completed a session"
                trackColor={{ false: Colors.light.backgroundSelected, true: Colors.light.primary }}
                thumbColor={Colors.light.backgroundElement}
              />
            </View>

            <TextArea
              placeholder="How did it feel? (optional)"
              value={notes}
              onChangeText={(t) => patchMeditation({ notes: t })}
              maxLength={1000}
            />

            <Pressable accessibilityRole="button" onPress={finish} className={`mt-2 ${PRIMARY_BUTTON}`}>
              <Text className="font-body-semibold text-base leading-6 text-white">
                Continue to Learning
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
