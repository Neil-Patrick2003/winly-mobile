import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import {
  EntryHeader,
  PillarHeading,
  SkipLink,
  StepFooter,
  StepIndicator,
} from '@/components/entry-chrome';
import { Field } from '@/components/ui/field';
import { MediaPicker } from '@/components/ui/media-picker';
import { TextArea } from '@/components/ui/text-area';
import { useEntryDraft } from '@/lib/entry-draft';

/**
 * Step 2. One thing learned, where it came from, and anything worth keeping a
 * picture of. Every field is optional — Next is always live.
 */
export default function LearningStepScreen() {
  const { draft, patchLearning } = useEntryDraft();
  const { learned, reference, photos } = draft.learning;

  // The reference and the photos are extras; the thing learned is the step, so
  // it alone decides both completion and whether the flow can move on.
  const hasInput = learned.trim().length > 0;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface-card"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <EntryHeader />

      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center px-6"
        contentContainerStyle={{ paddingTop: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <StepIndicator active="learning" />

        <View className="pt-7">
          <PillarHeading pillar="learning" subtitle="Share something you learned today" />
        </View>

        <View className="gap-3 pt-5">
          <TextArea
            placeholder="What did you learn today?"
            value={learned}
            // Writing something *is* completing the step — there is nothing a
            // separate confirmation would add, and emptying the box undoes it.
            onChangeText={(t) => patchLearning({ learned: t, completed: t.trim().length > 0 })}
            className="min-h-28 rounded-2xl border border-hairline bg-surface px-4 py-3.5 font-sans text-[15px] text-ink"
            maxLength={1000}
          />
          {/* Deliberately not a URL field — "that podcast on the drive home" is
              as valid a source as a link. */}
          <Field
            placeholder="Reference or source (optional) — book, article, video"
            value={reference}
            onChangeText={(t) => patchLearning({ reference: t })}
            maxLength={500}
          />
          <MediaPicker
            files={photos}
            onChange={(next) => patchLearning({ photos: next })}
            label="Attach a photo (notes, screenshot)"
          />
        </View>

        <View className="pt-5">
          <SkipLink pillar="learning" onPress={() => router.push('/entry/movement')} />
        </View>
      </ScrollView>

      <StepFooter
        onBack={() => router.back()}
        onNext={() => router.push('/entry/movement')}
        nextDisabled={!hasInput}
      />
    </KeyboardAvoidingView>
  );
}
