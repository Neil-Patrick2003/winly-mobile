import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';

import { ImageWithPlaceholder } from '@/components/ui/image';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { formatBytes, isWithinUploadLimit, MAX_UPLOAD_BYTES, shrinkAsset } from '@/lib/media';
import { createStory, type UserSummary } from '@/lib/stories';
import { useToast } from '@/lib/toast';
import { useStoryRail } from '@/lib/use-story-rail';

const BUBBLE = 62;
const RING = 68;

/** A circular avatar that falls back to an initial when there is no photo. */
function Avatar({ uri, name, size }: { uri: string | null; name: string; size: number }) {
  return (
    <ImageWithPlaceholder
      source={{ uri }}
      className="rounded-full"
      accessibilityLabel={`${name} profile photo`}>
      <View
        className="items-center justify-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500"
        style={{ width: size, height: size }}>
        <Text
          className="font-heading-bold text-white"
          style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}>
          {(name.trim()[0] ?? '?').toUpperCase()}
        </Text>
      </View>
    </ImageWithPlaceholder>
  );
}

/**
 * An avatar inside the gradient ring that marks a live story.
 *
 * The ring is a padded gradient behind the avatar with a surface-coloured gap
 * between the two, so it reads as a ring rather than a border.
 */
function RingedAvatar({ uri, name }: { uri: string | null; name: string }) {
  return (
    <View className="rounded-full bg-linear-to-tr from-green-400 via-sky-400 to-violet-400 p-[2.5px]">
      <View className="rounded-full bg-surface p-[2px]">
        <View style={{ width: BUBBLE, height: BUBBLE }}>
          <Avatar uri={uri} name={name} size={BUBBLE} />
        </View>
      </View>
    </View>
  );
}

function Caption({ children }: { children: string }) {
  return (
    <Text numberOfLines={1} className="font-sans text-[13px] leading-[18px] text-ink-muted">
      {children}
    </Text>
  );
}

/**
 * Your own place at the head of the rail.
 *
 * Two states, which is the whole point of the control: with no story it is a
 * plain add button, and with one live it becomes your story — your avatar, in
 * the ring everyone else's gets — with the plus demoted to a badge, the way
 * Messenger and Instagram do it. Tapping either adds another.
 */
function OwnBubble({
  uri,
  name,
  hasStory,
  busy,
  accent,
  onPress,
}: {
  uri: string | null;
  name: string;
  hasStory: boolean;
  busy: boolean;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hasStory ? 'Your story — add another' : 'Add story'}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      className={`w-[86px] items-center gap-2 active:opacity-70 ${busy ? 'opacity-60' : ''}`}>
      <View>
        {hasStory ? (
          <RingedAvatar uri={uri} name={name} />
        ) : (
          <View
            className="items-center justify-center rounded-full border-2 border-dashed"
            style={{ width: RING, height: RING, borderColor: accent }}>
            <SymbolView
              name={{ ios: 'plus', android: 'add', web: 'add' }}
              size={22}
              weight="medium"
              tintColor={accent}
            />
          </View>
        )}

        {busy ? (
          <View className="absolute inset-0 items-center justify-center rounded-full bg-black/35">
            <ActivityIndicator size="small" color="#FFFFFF" />
          </View>
        ) : hasStory ? (
          // Demoted to a badge once there is a story to show behind it.
          <View
            className="absolute bottom-0 right-0 h-6 w-6 items-center justify-center rounded-full border-2 border-surface"
            style={{ backgroundColor: accent }}>
            <SymbolView
              name={{ ios: 'plus', android: 'add', web: 'add' }}
              size={12}
              weight="bold"
              tintColor="#FFFFFF"
            />
          </View>
        ) : null}
      </View>

      <Caption>{hasStory ? 'Your story' : 'Add story'}</Caption>
    </Pressable>
  );
}

function PersonBubble({ person }: { person: UserSummary }) {
  const name = person.full_name;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}'s story`}
      className="w-[86px] items-center gap-2 active:opacity-70">
      <RingedAvatar uri={person.avatar_url} name={name} />
      <Caption>{name.trim().split(' ')[0] || name}</Caption>
    </Pressable>
  );
}

/**
 * Stories from the people you follow, and your own at the head.
 *
 * Its own horizontal list rather than a row inside the page's scroller: the
 * follow list is cursor paginated, and paging it as the *rail* reaches its end
 * is what keeps that independent of the feed below. A row inside a ScrollView
 * has no end to reach.
 */
export function StoryRail({ accent }: { accent: string }) {
  const { user, token, refreshUser } = useAuth();
  const { people, loading, loadingMore, loadMore, refresh } = useStoryRail();
  const showToast = useToast();
  const [posting, setPosting] = useState(false);

  const addStory = async () => {
    if (posting || !token) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'Enable photo access for Winly in Settings to post a story.'
      );
      return;
    }

    // Photos only: the stories table records no file kind, so the server has no
    // way to tell a client to play rather than display, and answers a video 422.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.8,
    });

    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;

    setPosting(true);
    try {
      const file = await shrinkAsset(asset);

      if (!isWithinUploadLimit(file)) {
        Alert.alert(
          'That photo is too large',
          `Stories are capped at ${formatBytes(MAX_UPLOAD_BYTES)}. Try a smaller one.`
        );
        return;
      }

      await createStory(file, '', token);

      // `has_active_story` is on the user record and the bubble reads it, so
      // the record has to be re-read before the rail will show the change.
      await refreshUser();
      await refresh();
      showToast('Story posted 🌱');
    } catch (caught) {
      Alert.alert(
        'Could not post your story',
        caught instanceof Error ? caught.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setPosting(false);
    }
  };

  return (
    <FlatList
      data={people}
      keyExtractor={(person) => person.id}
      renderItem={({ item }) => <PersonBubble person={item} />}
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mt-5 grow-0"
      contentContainerClassName="gap-3 px-4"
      // The rail carries its own cursor: reaching *its* end pages the follow
      // list, with nothing to do with how far down the feed has been scrolled.
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <OwnBubble
          uri={user?.avatar_url ?? null}
          name={user?.full_name ?? 'You'}
          hasStory={user?.has_active_story ?? false}
          busy={posting}
          accent={accent}
          onPress={addStory}
        />
      }
      ListFooterComponent={
        loading || loadingMore ? (
          <View className="h-[68px] w-12 items-center justify-center">
            <ActivityIndicator size="small" color={Colors.light.textSecondary} />
          </View>
        ) : null
      }
    />
  );
}
