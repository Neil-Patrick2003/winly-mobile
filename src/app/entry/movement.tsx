import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryProgress, dismissEntryFlow } from '@/components/entry-progress';
import { Field } from '@/components/ui/field';
import { MediaPicker } from '@/components/ui/media-picker';
import { TextArea } from '@/components/ui/text-area';
import { useEntryDraft } from '@/lib/entry-draft';

const PRIMARY_BUTTON =
  'items-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500 py-3.5 active:opacity-85';

/**
 * Movement pillar and the end of the flow: title, notes, photos, then Share.
 * Share submits the whole draft (meditation + learning + movement) and dismisses
 * back to the tabs. Submitting is a no-op until the entries endpoint exists.
 */
export default function MovementScreen() {
  const insets = useSafeAreaInsets();
  const { draft, patchMovement, submit } = useEntryDraft();
  const { title, notes, photos } = draft.movement;

  const [sharing, setSharing] = useState(false);

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await submit();
      // Tears down the whole modal flow and returns to the Create tab. Plain
      // dismissAll would only pop back to Meditation (see dismissEntryFlow).
      dismissEntryFlow();
    } catch {
      setSharing(false);
      Alert.alert('Could not share', 'Something went wrong. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <EntryProgress active="movement" onBack={() => router.back()} />

      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center px-6"
        contentContainerStyle={{ paddingTop: 20, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <View className="gap-1">
          <Text className="font-heading-bold text-2xl leading-8 text-ink">How did you move?</Text>
          <Text className="font-sans text-[15px] leading-[22px] text-ink-muted">
            A walk, a workout, a stretch. All optional — then share your day.
          </Text>
        </View>

        <View className="gap-3 pt-5">
          <Field
            icon={{ ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' }}
            placeholder="Title"
            value={title}
            onChangeText={(t) => patchMovement({ title: t })}
            maxLength={120}
          />
          <TextArea
            placeholder="Notes — what did you do, and how did it feel?"
            value={notes}
            onChangeText={(t) => patchMovement({ notes: t })}
            maxLength={1000}
          />
          <MediaPicker
            uris={photos}
            onChange={(next) => patchMovement({ photos: next })}
            label="Add photos"
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: sharing }}
          disabled={sharing}
          onPress={share}
          className={`mt-8 ${PRIMARY_BUTTON} ${sharing ? 'opacity-60' : ''}`}
          style={{ boxShadow: '0 8px 20px rgba(34, 197, 94, 0.35)' }}>
          <Text className="font-body-semibold text-base leading-6 text-white">
            {sharing ? 'Sharing…' : 'Share your ESC'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
