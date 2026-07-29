import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
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

import { ImageWithPlaceholder } from '@/components/ui/image';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { formatBytes, isWithinUploadLimit, MAX_UPLOAD_BYTES, shrinkAsset } from '@/lib/media';
import type { LocalFile } from '@/lib/posts';
import { createStory } from '@/lib/stories';
import { useToast } from '@/lib/toast';

/**
 * What the server takes for a story caption.
 *
 * Kept in step with `StoreStoryRequest::MAX_CAPTION_LENGTH`. Letting the box
 * run longer than the server accepts turns a caption nobody thought twice about
 * into a 422 raised halfway through an upload.
 */
const CAPTION_MAX = 255;

/**
 * Compose a story: one photo, and something to say over it.
 *
 * One rather than several, which is what a story is — a single moment that
 * stands on its own for a day. Posting a set meant several uploads behind one
 * button, a progress count to explain the wait, and a half-finished state to
 * recover from when the third of five failed. None of that bought anything the
 * person sharing wanted; adding a second story is one more tap on the rail.
 */
export default function NewStoryScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const muted = useResolveClassNames('text-ink-muted').color;
  const keyboardVisible = useKeyboardVisible();
  const { token } = useAuth();
  const showToast = useToast();

  const [photo, setPhoto] = useState<LocalFile | null>(null);
  const [caption, setCaption] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [posting, setPosting] = useState(false);

  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'Enable photo access for Winly in Settings to add a story.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      // Photos only. The stories table holds one `image_url` and nothing saying
      // what kind of file it is, so a video would arrive with no way for a
      // client to know to play rather than display it.
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset) return;

    setPreparing(true);
    try {
      // Shrunk first, and measured after: a 12MB camera photo comes out well
      // under the cap, so judging the original would turn away files that were
      // never going to be a problem.
      const prepared = await shrinkAsset(asset);

      if (!isWithinUploadLimit(prepared)) {
        Alert.alert(
          'That photo is too large',
          `Stories are capped at ${formatBytes(MAX_UPLOAD_BYTES)}. Try a smaller one.`
        );
        return;
      }

      setPhoto(prepared);
    } finally {
      setPreparing(false);
    }
  };

  const share = async () => {
    if (!token || !photo || posting) return;

    setPosting(true);
    try {
      await createStory(photo, caption, token);
      showToast('Story shared 🌱');
      router.back();
    } catch (caught) {
      setPosting(false);
      Alert.alert(
        'Could not share your story',
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
          onPress={() => router.back()}
          hitSlop={8}
          className="-ml-2 p-2 active:opacity-60">
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={18}
            tintColor={theme.text}
          />
        </Pressable>
        <Text className="flex-1 font-heading-bold text-xl leading-7 text-ink">Your story</Text>
      </View>

      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center px-4"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        {photo ? (
          <View className="overflow-hidden rounded-2xl bg-surface-selected">
            <ImageWithPlaceholder
              source={{ uri: photo.uri }}
              // Tall like the screen it will be watched on, so what you see
              // here is what people will see.
              className="aspect-[3/4] w-full"
              contentFit="cover"
              accessibilityLabel="Your story photo"
            />

            {!posting ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose a different photo"
                onPress={() => void pick()}
                hitSlop={6}
                className="absolute right-2.5 top-2.5 flex-row items-center gap-1.5 rounded-full bg-black/55 px-3 py-2 active:opacity-70">
                <SymbolView
                  name={{
                    ios: 'arrow.triangle.2.circlepath',
                    android: 'refresh',
                    web: 'refresh',
                  }}
                  size={12}
                  weight="bold"
                  tintColor="#FFFFFF"
                />
                <Text className="font-body-semibold text-[13px] leading-[18px] text-white">
                  Change
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a photo"
            accessibilityState={{ busy: preparing, disabled: preparing }}
            disabled={preparing}
            onPress={() => void pick()}
            className={`items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline bg-surface-card py-16 active:opacity-70 ${
              preparing ? 'opacity-60' : ''
            }`}>
            {preparing ? (
              <ActivityIndicator size="small" color={theme.textSecondary} />
            ) : (
              <SymbolView
                name={{
                  ios: 'photo.badge.plus',
                  android: 'add_photo_alternate',
                  web: 'add_photo_alternate',
                }}
                size={26}
                tintColor={theme.textSecondary}
              />
            )}
            <Text className="px-4 text-center font-sans text-[15px] leading-5 text-ink-muted">
              {preparing ? 'Preparing…' : 'Choose a photo'}
            </Text>
            {/* Said before the picker opens, not after a rejection — the cap is
                the kind of thing worth knowing while choosing. */}
            {!preparing ? (
              <Text className="px-4 text-center font-sans text-[12px] leading-4 text-ink-muted">
                One photo, up to {formatBytes(MAX_UPLOAD_BYTES)}
              </Text>
            ) : null}
          </Pressable>
        )}

        <Text className="mt-5 font-body-semibold text-[13px] leading-[18px] text-ink-muted">
          Say something
        </Text>
        <TextInput
          multiline
          value={caption}
          onChangeText={setCaption}
          placeholder="Add a few words to your story…"
          placeholderTextColor={muted}
          maxLength={CAPTION_MAX}
          editable={!posting}
          accessibilityLabel="Story caption"
          className="mt-2 min-h-24 rounded-2xl border border-hairline bg-surface-card px-4 py-3 font-sans text-[15px] leading-[22px] text-ink"
        />
      </ScrollView>

      <View
        className="border-t border-hairline bg-surface-card px-4 pt-3"
        style={{ paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !photo || posting, busy: posting }}
          disabled={!photo || posting}
          onPress={() => void share()}
          className={`flex-row items-center justify-center gap-2 rounded-full py-3.5 active:opacity-85 ${
            !photo || posting ? 'opacity-40' : ''
          }`}
          style={{ backgroundColor: theme.primary }}>
          {posting ? <ActivityIndicator size="small" color={theme.onPrimary} /> : null}
          <Text className="font-body-semibold text-base leading-6" style={{ color: theme.onPrimary }}>
            {posting ? 'Sharing…' : 'Share to your story'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
