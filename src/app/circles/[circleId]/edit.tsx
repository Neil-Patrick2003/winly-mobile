import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { circleLabel } from '@/components/circle-name';
import { CircleVisibilityPicker } from '@/components/circle-visibility-picker';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { fetchCircle, updateCircle, type Circle } from '@/lib/circles';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import { goBack } from '@/lib/navigation';

/** Kept in step with `StoreCircleRequest`, as the create form is. */
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
 * Change a circle you own.
 *
 * The create form again, filled in — a circle is corrected in the boxes it was
 * written in, and a differently worded screen for the same fields would read as
 * a different kind of thing.
 *
 * What is not here: the colour, which is the circle as people pick it out of a
 * list. The badge letter follows the name server-side, so it is not asked for
 * either.
 */
export default function EditCircleScreen() {
  const { circleId } = useLocalSearchParams<{ circleId: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const muted = useResolveClassNames('text-ink-muted').color;
  const keyboardVisible = useKeyboardVisible();
  const { token } = useAuth();
  const showToast = useToast();
  const confirm = useConfirm();

  const [circle, setCircle] = useState<Circle | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tag, setTag] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Keyed by the API's field name, so a 422 lands under the box at fault.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token || !circleId) return;

    let cancelled = false;
    (async () => {
      try {
        const found = await fetchCircle(circleId, token);
        if (cancelled) return;

        setCircle(found);
        setName(found.name);
        setDescription(found.description ?? '');
        setTag(found.tag ?? '');
        setIsPrivate(found.is_private);
      } catch (caught) {
        if (!cancelled) {
          setLoadError(
            caught instanceof Error ? caught.message : 'That circle could not be loaded.'
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [circleId, token]);

  const canSave = circle !== null && name.trim().length > 0 && !saving;

  const save = async () => {
    if (!token || !circle || !canSave) return;

    /*
     * Asked only on the way out into the open, as unfollowing is.
     *
     * Going private is a step back nobody regrets. Going public puts a group
     * that has been talking among itself in front of everybody, and every win
     * already on its wall goes with it — which is the sort of thing to be sure
     * of before it is done rather than sorry about after.
     */
    if (circle.is_private && !isPrivate) {
      const confirmed = await confirm({
        title: `Make ${circleLabel(circle)} public?`,
        message:
          'Anyone will be able to find it in Discover and join, and everything already shared into it comes with it.',
        confirmLabel: 'Make public',
        destructive: true,
      });
      if (!confirmed) return;
    }

    setSaving(true);
    setFieldErrors({});
    try {
      /*
       * Both optional fields go every time, emptied ones included.
       *
       * Leaving a key out means "as it was" — that is what makes a partial
       * change possible — so a description someone has just cleared would come
       * straight back. `updateCircle` sends an emptied box as an explicit null,
       * which is how the server is told to drop it.
       */
      await updateCircle(circle.id, { name, description, tag, isPrivate }, token);

      // Named out loud when it moved: a circle changing who can find it is
      // worth more than the same "Circle updated" a fixed typo gets.
      showToast(
        isPrivate === circle.is_private
          ? 'Circle updated'
          : isPrivate
            ? 'Circle is private now'
            : 'Circle is public now'
      );
      goBack({ pathname: '/circles/[circleId]', params: { circleId: circle.id } });
    } catch (caught) {
      setSaving(false);

      if (caught instanceof ApiError && Object.keys(caught.fieldErrors).length > 0) {
        setFieldErrors(caught.fieldErrors);
        return;
      }

      Alert.alert(
        'Could not save those changes',
        caught instanceof Error ? caught.message : 'Something went wrong. Please try again.'
      );
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
          onPress={() => goBack({ pathname: '/circles/[circleId]', params: { circleId } })}
          hitSlop={8}
          className="-ml-2 p-2 active:opacity-60">
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={18}
            tintColor={theme.text}
          />
        </Pressable>
        <Text className="flex-1 font-heading-bold text-xl leading-7 text-ink">Edit circle</Text>
      </View>

      {loadError !== null ? (
        <View className="flex-1 items-center justify-center px-10">
          <Text className="text-center font-sans text-[15px] leading-[22px] text-ink-muted">
            {loadError}
          </Text>
        </View>
      ) : circle === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={theme.textSecondary} />
        </View>
      ) : /* The server refuses anyone else outright; this is so the refusal is a
            sentence rather than a 403 after typing. */
      !circle.is_owner ? (
        <View className="flex-1 items-center justify-center px-10">
          <Text className="text-center font-sans text-[15px] leading-[22px] text-ink-muted">
            Only the person who started a circle can change it.
          </Text>
        </View>
      ) : (
        <>
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
              {fieldErrors.tag ? (
                <Text className="mt-1.5 px-1 font-sans text-[12px] leading-4 text-red-500">
                  {fieldErrors.tag}
                </Text>
              ) : null}
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
                {saving ? 'Saving…' : 'Save changes'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}
