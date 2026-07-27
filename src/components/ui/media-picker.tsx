import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, Text, View } from 'react-native';

import { Image } from '@/components/ui/image';
import { Colors } from '@/constants/theme';

/**
 * Attach one or more photos to an entry, backed by the system library picker.
 *
 * `expo-image-picker` is a native module, so this only runs in a dev/production
 * build. The picker asks for library permission itself on first use; the extra
 * `requestMediaLibraryPermissionsAsync` here is to give a clear message when a
 * previous denial means the OS will no longer prompt.
 *
 * State lives in the parent: `uris` is the current selection, `onChange` gets
 * the next one. Photos are held as local `file://` URIs — uploading them is the
 * caller's job once there is an endpoint.
 */
export function MediaPicker({
  uris,
  onChange,
  label = 'Add photos',
  max = 4,
}: {
  uris: string[];
  onChange: (next: string[]) => void;
  label?: string;
  max?: number;
}) {
  const atLimit = uris.length >= max;

  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'Enable photo access for Winly in Settings to attach an image.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: max - uris.length,
      quality: 0.8,
    });

    if (result.canceled) return;
    const added = result.assets.map((a) => a.uri);
    onChange([...uris, ...added].slice(0, max));
  };

  const removeAt = (index: number) => onChange(uris.filter((_, i) => i !== index));

  return (
    <View className="gap-2.5">
      {uris.length > 0 ? (
        <View className="flex-row flex-wrap gap-2.5">
          {uris.map((uri, i) => (
            <View key={uri} className="h-24 w-24 overflow-hidden rounded-2xl bg-surface-selected">
              <Image source={{ uri }} className="h-full w-full" contentFit="cover" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${i + 1}`}
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
          onPress={pick}
          className="flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline bg-surface-card py-6 active:opacity-70">
          <SymbolView
            name={{
              ios: 'photo.badge.plus',
              android: 'add_photo_alternate',
              web: 'add_photo_alternate',
            }}
            size={20}
            tintColor={Colors.light.textSecondary}
          />
          <Text className="font-sans text-sm leading-5 text-ink-muted">
            {uris.length > 0 ? 'Add more' : label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
