import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { ImageWithPlaceholder } from '@/components/ui/image';
import { Colors } from '@/constants/theme';
import { formatBytes, isWithinUploadLimit, MAX_UPLOAD_BYTES, shrinkAsset } from '@/lib/media';
import type { LocalFile } from '@/lib/posts';

/** How many photos one pillar takes. */
export const MAX_PHOTOS = 5;

/**
 * Attach photos to an entry, backed by the system library picker.
 *
 * Photos only. Video is not offered at all rather than picked and then
 * rejected: this app cannot transcode one, so a clip goes up at its full size
 * or not at all, and neither is a good outcome to discover after choosing it.
 *
 * `expo-image-picker` is a native module, so this only runs in a dev/production
 * build. The picker asks for library permission itself on first use; the extra
 * `requestMediaLibraryPermissionsAsync` here is to give a clear message when a
 * previous denial means the OS will no longer prompt.
 *
 * State lives in the parent: `files` is the current selection, `onChange` gets
 * the next one. Each entry keeps the name and MIME type alongside the local
 * URI, because that is what the upload needs — the server decides image versus
 * video from the type, so guessing it wrong misfiles the upload.
 */
export function MediaPicker({
  files,
  onChange,
  label = 'Add photos',
  max = MAX_PHOTOS,
}: {
  files: LocalFile[];
  onChange: (next: LocalFile[]) => void;
  label?: string;
  max?: number;
}) {
  const atLimit = files.length >= max;
  const [preparing, setPreparing] = useState(false);

  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'Enable photo access for Welle in Settings to attach an image.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: max - files.length,
      quality: 0.8,
    });

    if (result.canceled) return;

    // Downscaled here rather than at upload time, so what the thumbnail shows
    // is the file that actually gets sent, and the wait lands on the picker
    // instead of on the Share button.
    setPreparing(true);
    try {
      const prepared = await Promise.all(result.assets.map(shrinkAsset));
      // Size is judged on the shrunk file, so the cap only ever turns away a
      // photo that would really have gone up too big. Whatever fits is kept —
      // dropping the whole selection over one file would lose the rest of a
      // careful pick.
      const added = prepared.filter(isWithinUploadLimit);
      if (added.length > 0) onChange([...files, ...added].slice(0, max));

      const rejected = prepared.length - added.length;
      if (rejected > 0) {
        Alert.alert(
          rejected === 1 ? 'Photo too large' : `${rejected} photos too large`,
          `Each photo has to be under ${formatBytes(MAX_UPLOAD_BYTES)}. ${
            rejected === 1 ? 'It was' : 'They were'
          } left out — the rest were added.`
        );
      }
    } finally {
      setPreparing(false);
    }
  };

  const removeAt = (index: number) => onChange(files.filter((_, i) => i !== index));

  return (
    <View className="gap-2.5">
      {files.length > 0 ? (
        <View className="flex-row flex-wrap gap-2.5">
          {files.map((file, i) => (
            <View
              key={file.uri}
              className="h-24 w-24 overflow-hidden rounded-2xl bg-surface-selected">
              {/* A picked photo can vanish from the library before the entry is
                  shared, so the thumbnail has to survive its file going away. */}
              <ImageWithPlaceholder
                source={{ uri: file.uri }}
                className="h-full w-full"
                accessibilityLabel={`Attachment ${i + 1}`}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove attachment ${i + 1}`}
                onPress={() => removeAt(i)}
                hitSlop={6}
                className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/55 active:opacity-70">
                <SymbolView
                  name={{ ios: 'xmark', android: 'close', web: 'close' }}
                  size={12}
                  weight="bold"
                  tintColor="#FFFFFF"
                />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {!atLimit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ busy: preparing, disabled: preparing }}
          disabled={preparing}
          onPress={pick}
          className={`items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline bg-surface py-7 active:opacity-70 ${
            preparing ? 'opacity-60' : ''
          }`}>
          {preparing ? (
            <ActivityIndicator size="small" color={Colors.light.textSecondary} />
          ) : (
            <SymbolView
              name={{
                ios: 'photo.badge.plus',
                android: 'add_photo_alternate',
                web: 'add_photo_alternate',
              }}
              size={22}
              tintColor={Colors.light.textSecondary}
            />
          )}
          <Text className="px-4 text-center font-sans text-[15px] leading-5 text-ink-muted">
            {preparing
              ? 'Preparing…'
              : files.length > 0
                ? `Add more (${files.length}/${max})`
                : label}
          </Text>
        </Pressable>
      ) : (
        // The button is gone at this point, so without this the limit reads as
        // the picker having broken.
        <Text className="px-1 font-sans text-[13px] leading-[18px] text-ink-muted">
          {max} photos is the most you can attach. Remove one to swap it out.
        </Text>
      )}
    </View>
  );
}
