import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import {
  EntryHeader,
  PillarHeading,
  PILLAR_THEME,
  SkipLink,
  StepFooter,
  StepIndicator,
} from '@/components/entry-chrome';
import { Chip } from '@/components/ui/chip';
import { MediaPicker } from '@/components/ui/media-picker';
import { TextArea } from '@/components/ui/text-area';
import {
  ACTIVITIES,
  isMovementAnswered as isAnswered,
  OTHER_ACTIVITY,
  useEntryDraft,
} from '@/lib/entry-draft';
import { goBack } from '@/lib/navigation';

const THEME = PILLAR_THEME.movement;

/** Step 3, and the last one before Review. */
export default function MovementStepScreen() {
  const { draft, patchMovement } = useEntryDraft();
  const { activity, otherActivity, photos } = draft.movement;

  const hasInput = isAnswered(activity, otherActivity);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface-card"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <EntryHeader />

      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center px-4"
        contentContainerStyle={{ paddingTop: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <StepIndicator active="movement" />

        <View className="pt-7">
          <PillarHeading pillar="movement" subtitle="What did you do to move your body?" />
        </View>

        <View className="flex-row flex-wrap gap-2.5 pt-5">
          {ACTIVITIES.map((item) => (
            <Chip
              key={item.label}
              label={item.label}
              icon={item.icon}
              selected={item.label === activity}
              accent={THEME.accent}
              tint={THEME.tint}
              // Tapping the chosen one again clears it, so a mis-tap is not
              // permanent — there is no "none of these" chip to fall back to.
              onPress={() => {
                const next = item.label === activity ? null : item.label;
                patchMovement({ activity: next, completed: isAnswered(next, otherActivity) });
              }}
            />
          ))}
        </View>

        {activity === OTHER_ACTIVITY ? (
          <View className="pt-3">
            <TextArea
              placeholder="What did you do?"
              value={otherActivity}
              onChangeText={(t) =>
                patchMovement({ otherActivity: t, completed: isAnswered(activity, t) })
              }
              className="min-h-24 rounded-2xl border border-hairline bg-surface px-4 py-3.5 font-sans text-[15px] text-ink"
              maxLength={200}
              autoFocus
            />
          </View>
        ) : null}

        <View className="pt-5">
          <MediaPicker
            files={photos}
            onChange={(next) => patchMovement({ photos: next })}
            label="Attach a photo of your movement"
          />
        </View>

        <View className="pt-5">
          <SkipLink pillar="movement" onPress={() => router.push('/entry/review')} />
        </View>
      </ScrollView>

      <StepFooter
        onBack={() => goBack()}
        onNext={() => router.push('/entry/review')}
        nextLabel="Review"
        nextDisabled={!hasInput}
      />
    </KeyboardAvoidingView>
  );
}
