import * as ImagePicker from 'expo-image-picker';
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
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatBytes, isWithinUploadLimit, MAX_UPLOAD_BYTES, shrinkAsset } from '@/lib/media';
import type { LocalFile } from '@/lib/posts';
import {
  BIO_MAX,
  NAME_MAX,
  updateProfile,
  USERNAME_MAX,
  USERNAME_PATTERN,
  type ProfileUpdate,
} from '@/lib/profile';
import { useToast } from '@/lib/toast';
import { goBack } from '@/lib/navigation';

/**
 * One field as a row inside the section card.
 *
 * The label sits above its input and the card carries the fill, which is the
 * shape every other grouped list in the app uses — a screen of individually
 * outlined boxes read as a form bolted on rather than part of the same app.
 */
function Field({
  label,
  hint,
  error,
  first = false,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  /** The first row owns no divider above it. */
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View className={first ? 'px-4 py-3.5' : 'border-t border-hairline px-4 py-3.5'}>
      <Text className="font-body-semibold text-[13px] leading-[18px] text-ink-muted">{label}</Text>
      {children}
      {error ? (
        <Text className="mt-1.5 font-sans text-[12px] leading-4 text-red-500">{error}</Text>
      ) : hint ? (
        <Text className="mt-1.5 font-sans text-[12px] leading-4 text-ink-muted">{hint}</Text>
      ) : null}
    </View>
  );
}

/**
 * Edit your own profile.
 *
 * Only what changed is sent. The endpoint patches, so leaving a field alone and
 * clearing it are different things — and a bio somebody deliberately emptied
 * must not come back on the next save.
 */
export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const muted = useResolveClassNames('text-ink-muted').color;
  const keyboardVisible = useKeyboardVisible();
  const { user, token, refreshUser } = useAuth();
  const showToast = useToast();

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');

  /**
   * The photo as it stands: `undefined` means untouched, `null` means taken
   * down, and a file means a new one is waiting to go up.
   */
  const [avatar, setAvatar] = useState<LocalFile | null | undefined>(undefined);

  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'Enable photo access for Winly in Settings to change your picture.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset) return;

    setPreparing(true);
    try {
      const prepared = await shrinkAsset(asset);

      if (!isWithinUploadLimit(prepared)) {
        Alert.alert(
          'That photo is too large',
          `Profile photos are capped at ${formatBytes(MAX_UPLOAD_BYTES)}. Try a smaller one.`
        );
        return;
      }

      setAvatar(prepared);
    } finally {
      setPreparing(false);
    }
  };

  const trimmedName = fullName.trim();
  const trimmedUsername = username.trim().toLowerCase();
  const trimmedEmail = email.trim();
  const trimmedBio = bio.trim();

  /** Caught here so an obvious slip does not cost a round trip. */
  const localError = (): Record<string, string> | null => {
    if (trimmedName.length === 0) return { full_name: 'Your name cannot be empty.' };
    if (trimmedUsername.length < 3) {
      return { username: 'A username needs at least 3 characters.' };
    }
    if (!USERNAME_PATTERN.test(trimmedUsername)) {
      return { username: 'Only lowercase letters, numbers and underscores.' };
    }
    return null;
  };

  const save = async () => {
    if (!token || !user || saving) return;

    const local = localError();
    if (local) {
      setFieldErrors(local);
      return;
    }

    // Only what actually moved. Sending every field back would re-submit the
    // email untouched, and the server clears verification whenever that changes
    // — so an unrelated edit would quietly sign you out of a verified address.
    const changes: ProfileUpdate = {};
    if (trimmedName !== user.full_name) changes.full_name = trimmedName;
    if (trimmedUsername !== user.username) changes.username = trimmedUsername;
    if (trimmedEmail !== user.email) changes.email = trimmedEmail;
    if (trimmedBio !== (user.bio ?? '')) changes.bio = trimmedBio.length > 0 ? trimmedBio : null;
    if (avatar !== undefined) changes.avatar = avatar;

    if (Object.keys(changes).length === 0) {
      goBack('/(tabs)/profile');
      return;
    }

    setSaving(true);
    setFieldErrors({});
    try {
      await updateProfile(changes, token);
      // The profile screen reads the user from auth, so this is what makes the
      // change show up behind this one.
      await refreshUser();

      showToast('Profile updated');
      goBack('/(tabs)/profile');
    } catch (caught) {
      setSaving(false);

      if (caught instanceof ApiError && Object.keys(caught.fieldErrors).length > 0) {
        setFieldErrors(caught.fieldErrors);
        return;
      }

      Alert.alert(
        'Could not save your profile',
        caught instanceof Error ? caught.message : 'Something went wrong. Please try again.'
      );
    }
  };

  if (!user) {
    goBack('/(tabs)/profile');
    return null;
  }

  // What the picker holds if it has been touched, otherwise what is stored.
  const shownAvatar = avatar === undefined ? user.avatar_url : (avatar?.uri ?? null);
  const initial = (user.full_name.trim()[0] ?? user.username[0] ?? '?').toUpperCase();

  return (
    <KeyboardAvoidingView className="flex-1 bg-surface" behavior="padding">
      <View
        className="flex-row items-center gap-2 px-4 pb-2"
        style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => goBack('/(tabs)/profile')}
          hitSlop={8}
          className="-ml-2 p-2 active:opacity-60">
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={18}
            tintColor={theme.text}
          />
        </Pressable>
        <Text className="flex-1 font-heading-bold text-xl leading-7 text-ink">Edit profile</Text>
      </View>

      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center px-4"
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        {/* The same gradient the profile wears, so editing reads as the same
            place rather than a form about it. */}
        <View
          className="-mx-4 bg-linear-to-r from-green-400 via-sky-400 to-violet-400"
          style={{ height: 72 }}
        />

        <View className="-mt-12 items-center gap-3 pb-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            accessibilityState={{ busy: preparing }}
            disabled={preparing || saving}
            onPress={() => void pick()}
            className="active:opacity-70">
            <ImageWithPlaceholder
              source={{ uri: shownAvatar }}
              className="h-24 w-24 rounded-full"
              accessibilityLabel="Your profile photo">
              <View className="h-24 w-24 items-center justify-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500">
                <Text className="font-heading-bold text-4xl leading-[44px] text-white">
                  {initial}
                </Text>
              </View>
            </ImageWithPlaceholder>

            <View
              className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2 border-surface"
              style={{ backgroundColor: theme.primary }}>
              {preparing ? (
                <ActivityIndicator size="small" color={theme.onPrimary} />
              ) : (
                <SymbolView
                  name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }}
                  size={14}
                  tintColor={theme.onPrimary}
                />
              )}
            </View>
          </Pressable>

          {shownAvatar ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove profile photo"
              disabled={saving}
              onPress={() => setAvatar(null)}
              className="active:opacity-60">
              <Text className="font-body-semibold text-[13px] leading-[18px] text-ink-muted">
                Remove photo
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View className="mt-6 overflow-hidden rounded-3xl bg-surface-card">
        <Field first label="Name" error={fieldErrors.full_name}>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            placeholderTextColor={muted}
            maxLength={NAME_MAX}
            editable={!saving}
            accessibilityLabel="Full name"
            className="mt-1 p-0 font-sans text-[15px] leading-[22px] text-ink"
          />
        </Field>

        <Field
          label="Username"
          hint="Lowercase letters, numbers and underscores."
          error={fieldErrors.username}>
          <View className="mt-1 flex-row items-center">
            <Text className="font-sans text-[15px] leading-[22px] text-ink-muted">@</Text>
            <TextInput
              value={username}
              onChangeText={(next) => setUsername(next.toLowerCase())}
              placeholder="username"
              placeholderTextColor={muted}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={USERNAME_MAX}
              editable={!saving}
              accessibilityLabel="Username"
              className="flex-1 p-0 font-sans text-[15px] leading-[22px] text-ink"
            />
          </View>
        </Field>

        <Field
          label="Email"
          hint={
            user.email_verified_at === null
              ? undefined
              : 'Changing this means verifying the new address.'
          }
          error={fieldErrors.email}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!saving}
            accessibilityLabel="Email address"
            className="mt-1 p-0 font-sans text-[15px] leading-[22px] text-ink"
          />
        </Field>

        <Field label="Bio" error={fieldErrors.bio}>
          <TextInput
            multiline
            value={bio}
            onChangeText={setBio}
            placeholder="A line about what you are working on…"
            placeholderTextColor={muted}
            maxLength={BIO_MAX}
            editable={!saving}
            accessibilityLabel="Bio"
            className="mt-1 min-h-20 p-0 font-sans text-[15px] leading-[22px] text-ink"
          />
        </Field>

        </View>
      </ScrollView>

      <View
        className="border-t border-hairline bg-surface-card px-4 pt-3"
        style={{ paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saving, busy: saving }}
          disabled={saving}
          onPress={() => void save()}
          className={`flex-row items-center justify-center gap-2 rounded-full py-3.5 active:opacity-85 ${
            saving ? 'opacity-40' : ''
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
    </KeyboardAvoidingView>
  );
}
