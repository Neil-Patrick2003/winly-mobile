import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { CircleVisibilityPicker } from '@/components/circle-visibility-picker';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { createCircle } from '@/lib/circles';
import { useAlert } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import { goBack } from '@/lib/navigation';

/** Kept in step with `StoreCircleRequest`. */
const NAME_MAX = 60;
const DESCRIPTION_MAX = 500;
const TAG_MAX = 40;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mt-5">
      <Text className="font-body-semibold text-[13px] leading-[18px] text-ink-muted">{label}</Text>
      {children}
    </View>
  );
}

/**
 * Start a circle.
 *
 * Top-level only. A circle inside another is made from the website, on the
 * owner's manage page — it decides who ends up able to read a group's wins, and
 * that is a decision to make sitting down rather than on a phone.
 *
 * Public unless said otherwise, which is what the picker starts on: most
 * circles want to be found, and a private one is the deliberate choice.
 */
export default function NewCircleScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const muted = useResolveClassNames('text-ink-muted').color;
  const keyboardVisible = useKeyboardVisible();
  const { token } = useAuth();
  const showToast = useToast();
  const alert = useAlert();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tag, setTag] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  // Keyed by the API's field name, so a 422 lands under the box at fault.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const canSave = name.trim().length > 0 && !saving;

  const save = async () => {
    if (!token || !canSave) return;

    setSaving(true);
    setFieldErrors({});
    try {
      const circle = await createCircle({ name, description, tag, isPrivate }, token);

      showToast(isPrivate ? 'Private circle started 🌱' : 'Circle started 🌱');
      // Replaced rather than pushed onto: going back from the new circle should
      // land on the list, not on the form that made it.
      router.replace({ pathname: '/circles/[circleId]', params: { circleId: circle.id } });
    } catch (caught) {
      setSaving(false);

      if (caught instanceof ApiError && Object.keys(caught.fieldErrors).length > 0) {
        setFieldErrors(caught.fieldErrors);
        return;
      }

      await alert({
        title: 'Could not start that circle',
        message: caught instanceof Error ? caught.message : 'Something went wrong. Please try again.',
      });
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-surface" behavior="padding">
      <View
        className="flex-row items-center gap-2 px-4 pb-2"
        style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => goBack('/(tabs)/circles')}
          hitSlop={8}
          className="-ml-2 p-2 active:opacity-60">
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={18}
            tintColor={theme.text}
          />
        </Pressable>
        <Text className="flex-1 font-heading-bold text-xl leading-7 text-ink">New circle</Text>
      </View>

      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center px-4"
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <Field label="Name">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Morning Runners"
            placeholderTextColor={muted}
            maxLength={NAME_MAX}
            editable={!saving}
            accessibilityLabel="Circle name"
            className="mt-2 rounded-2xl border border-hairline bg-surface-card px-4 py-3 font-sans text-[15px] leading-[22px] text-ink"
          />
          {fieldErrors.name ? (
            <Text className="mt-1.5 px-1 font-sans text-[12px] leading-4 text-red-500">
              {fieldErrors.name}
            </Text>
          ) : null}
        </Field>

        <Field label="What it is for">
          <TextInput
            multiline
            value={description}
            onChangeText={setDescription}
            placeholder="Before the sun is up, three times a week."
            placeholderTextColor={muted}
            maxLength={DESCRIPTION_MAX}
            editable={!saving}
            accessibilityLabel="Circle description"
            className="mt-2 min-h-24 rounded-2xl border border-hairline bg-surface-card px-4 py-3 font-sans text-[15px] leading-[22px] text-ink"
          />
          {fieldErrors.description ? (
            <Text className="mt-1.5 px-1 font-sans text-[12px] leading-4 text-red-500">
              {fieldErrors.description}
            </Text>
          ) : null}
        </Field>

        <Field label="Tag (optional)">
          <TextInput
            value={tag}
            onChangeText={setTag}
            placeholder="fitness"
            placeholderTextColor={muted}
            maxLength={TAG_MAX}
            autoCapitalize="none"
            editable={!saving}
            accessibilityLabel="Circle tag"
            className="mt-2 rounded-2xl border border-hairline bg-surface-card px-4 py-3 font-sans text-[15px] leading-[22px] text-ink"
          />
        </Field>

        <CircleVisibilityPicker
          isPrivate={isPrivate}
          onChange={setIsPrivate}
          disabled={saving}
        />
      </ScrollView>

      <View
        className="border-t border-hairline bg-surface-card px-4 pt-3"
        style={{ paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave, busy: saving }}
          disabled={!canSave}
          onPress={() => void save()}
          className={`flex-row items-center justify-center gap-2 rounded-full py-3.5 active:opacity-85 ${
            canSave ? '' : 'opacity-40'
          }`}
          style={{ backgroundColor: theme.primary }}>
          {saving ? <ActivityIndicator size="small" color={theme.onPrimary} /> : null}
          <Text
            className="font-body-semibold text-base leading-6"
            style={{ color: theme.onPrimary }}>
            {saving ? 'Starting…' : 'Start circle'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
