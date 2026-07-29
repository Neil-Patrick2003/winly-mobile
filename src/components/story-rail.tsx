import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { ImageWithPlaceholder } from '@/components/ui/image';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { type UserSummary } from '@/lib/stories';
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
 * An avatar inside the ring that marks a live story.
 *
 * The ring is a padded fill behind the avatar with a surface-coloured gap
 * between the two, so it reads as a ring rather than a border.
 *
 * Watching does not take the ring away — the story is still there to watch
 * again, and a bubble that lost its ring would read as nothing to see. It only
 * loses its colour: bright while something is unwatched, a flat grey once the
 * run has been seen through. Same shape, same size, so a rail does not reflow
 * as you work along it.
 */
function RingedAvatar({
  uri,
  name,
  seen,
}: {
  uri: string | null;
  name: string;
  /** Every story in their run has been watched. */
  seen: boolean;
}) {
  return (
    <View
      className={`rounded-full p-[2.5px] ${
        seen ? 'bg-surface-selected' : 'bg-linear-to-tr from-green-400 via-sky-400 to-violet-400'
      }`}>
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
  accent,
  onPress,
  onAdd,
}: {
  uri: string | null;
  name: string;
  hasStory: boolean;
  accent: string;
  /** Watch your story, or start one when there is none. */
  onPress: () => void;
  /** Always adds, whatever is already up. */
  onAdd: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hasStory ? 'Watch your story' : 'Add story'}
      onPress={onPress}
      className="w-[86px] items-center gap-2 active:opacity-70">
      <View>
        {hasStory ? (
          // Always bright: your own ring tracks whether you have something up,
          // not whether you have watched it. You know what you posted.
          <RingedAvatar uri={uri} name={name} seen={false} />
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

        {hasStory ? (
          // Demoted to a badge once there is a story to show behind it, and its
          // own button: the bubble watches, the badge adds.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add to your story"
            onPress={onAdd}
            hitSlop={6}
            className="absolute bottom-0 right-0 h-6 w-6 items-center justify-center rounded-full border-2 border-surface active:opacity-70"
            style={{ backgroundColor: accent }}>
            <SymbolView
              name={{ ios: 'plus', android: 'add', web: 'add' }}
              size={12}
              weight="bold"
              tintColor="#FFFFFF"
            />
          </Pressable>
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
      accessibilityLabel={
        person.has_active_story
          ? person.has_unseen_story
            ? `Watch ${name}'s story`
            : `Watch ${name}'s story again — already seen`
          : `${name} — no story right now`
      }
      onPress={() =>
        router.push({ pathname: '/story/[userId]', params: { userId: person.id } })
      }
      className="w-[86px] items-center gap-2 active:opacity-70">
      {/* The ring is what says there is something to watch, so someone with
          nothing up gets a plain avatar rather than a promise the viewer
          cannot keep. */}
      {person.has_active_story ? (
        <RingedAvatar uri={person.avatar_url} name={name} seen={!person.has_unseen_story} />
      ) : (
        <View style={{ width: RING, height: RING }} className="items-center justify-center">
          <Avatar uri={person.avatar_url} name={name} size={BUBBLE} />
        </View>
      )}
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
  const { user, refreshUser } = useAuth();
  const { people, loading, loadingMore, loadMore, refresh } = useStoryRail();

  // Posting and watching both happen on screens pushed over this one, and both
  // change what the rail should draw — a new story of your own, or a ring that
  // has been watched through. Coming back is the moment to find out.
  useFocusEffect(
    useCallback(() => {
      void refreshUser();
      void refresh();
    }, [refreshUser, refresh])
  );

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
          accent={accent}
          // With a story to show, the bubble watches it and the badge adds
          // another — the split Messenger and Instagram both use. With none,
          // the whole thing is an add button.
          onPress={() =>
            user?.has_active_story
              ? router.push({ pathname: '/story/[userId]', params: { userId: user.id } })
              : router.push('/story/new')
          }
          onAdd={() => router.push('/story/new')}
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
