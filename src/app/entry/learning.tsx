import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryProgress } from '@/components/entry-progress';
import { Field } from '@/components/ui/field';
import { MediaPicker } from '@/components/ui/media-picker';
import { TextArea } from '@/components/ui/text-area';
import { useEntryDraft } from '@/lib/entry-draft';

const PRIMARY_BUTTON =
  'items-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500 py-3.5 active:opacity-85';

/**
 * Learning pillar: what you read or figured out, an optional source link, a
 * reflection, and photos. Every field is optional — Continue is always live, so
 * a light day can pass straight through to Movement.
 */
export default function LearningScreen() {
  const insets = useSafeAreaInsets();
  const { draft, patchLearning } = useEntryDraft();
  const { title, link, reflection, photos } = draft.learning;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <EntryProgress active="learning" onBack={() => router.back()} />

      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center px-6"
        contentContainerStyle={{ paddingTop: 20, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <View className="gap-1">
          <Text className="font-heading-bold text-2xl leading-8 text-ink">
            What did you learn?
          </Text>
          <Text className="font-sans text-[15px] leading-[22px] text-ink-muted">
            Something you read or figured out today. All optional.
          </Text>
        </View>

        <View className="gap-3 pt-5">
          <Field
            icon={{ ios: 'book', android: 'menu_book', web: 'menu_book' }}
            placeholder="Title"
            value={title}
            onChangeText={(t) => patchLearning({ title: t })}
            maxLength={120}
          />
          <Field
            icon={{ ios: 'link', android: 'link', web: 'link' }}
            placeholder="Reference link (optional)"
            value={link}
            onChangeText={(t) => patchLearning({ link: t })}
            autoCapitalize="none"
            keyboardType="url"
            maxLength={500}
          />
          <TextArea
            placeholder="Your reflection — what stuck with you?"
            value={reflection}
            onChangeText={(t) => patchLearning({ reflection: t })}
            maxLength={1000}
          />
          <MediaPicker
            uris={photos}
            onChange={(next) => patchLearning({ photos: next })}
            label="Add photos"
          />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/entry/movement')}
          className={`mt-8 ${PRIMARY_BUTTON}`}>
          <Text className="font-body-semibold text-base leading-6 text-white">
            Continue to Movement
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
