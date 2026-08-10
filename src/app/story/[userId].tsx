import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImageWithPlaceholder } from '@/components/ui/image';
import { useAuth } from '@/lib/auth-context';
import { useAlert, useConfirm } from '@/lib/confirm';
import {
  deleteStory,
  fetchStoryReels,
  markStoryViewed,
  reactionEmoji,
  reactToStory,
  removeStoryReaction,
  STORY_REACTIONS,
  type Story,
  type StoryReactionType,
  type StoryReel,
} from '@/lib/stories';
import { timeAgo } from '@/lib/time';
import { goBack } from '@/lib/navigation';

/** How long one story holds the screen before the next one takes over. */
const DURATION_MS = 10_000;

/**
 * The bars across the top: one per story, filling as its turn runs.
 *
 * One set per person, not one across everybody — the bars say how far through
 * this run you are, and a strip of forty hairlines would say nothing at all.
 *
 * Driven from JS rather than the native driver: the fill is a percentage width,
 * and layout properties are not among the handful the native driver can carry.
 * A ten-second linear crawl is forgiving enough for that to go unnoticed.
 */
function ProgressBars({
  count,
  index,
  progress,
}: {
  count: number;
  index: number;
  progress: Animated.Value;
}) {
  return (
    <View className="flex-row gap-1 px-3">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
          <Animated.View
            className="h-full rounded-full bg-white"
            style={{
              width:
                i < index
                  ? // Already watched: filled and static.
                    '100%'
                  : i > index
                    ? 0
                    : progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
            }}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * One reaction, with the movement that makes it feel like it landed.
 *
 * Two things happen on a tap. The emoji itself dips and springs back, which is
 * the button acknowledging the press — that plays whether you are choosing a
 * reaction or clearing the one you left. And a copy of it floats up and fades,
 * which plays only when choosing, because it is the reaction going *to* the
 * story rather than a state changing.
 *
 * Each button owns both animations rather than the bar driving them centrally:
 * the float has to rise from the emoji that was tapped, and a component that
 * holds its own values needs no arithmetic to work out where that is.
 */
function ReactionButton({
  emoji,
  label,
  chosen,
  onPress,
}: {
  emoji: string;
  label: string;
  /** The reaction currently left on this story. */
  chosen: boolean;
  onPress: () => void;
}) {
  // The initialiser form means each value is built once and never replaced.
  const [scale] = useState(() => new Animated.Value(1));
  const [rise] = useState(() => new Animated.Value(0));
  const [rising, setRising] = useState(false);

  const press = () => {
    // Choosing, as opposed to clearing the one already there.
    const choosing = !chosen;

    scale.setValue(0.8);
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 150,
      useNativeDriver: true,
    }).start();

    if (choosing) {
      setRising(true);
      rise.setValue(0);
      Animated.timing(rise, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRising(false);
      });
    }

    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={chosen ? `Remove ${label} reaction` : `React ${label}`}
      accessibilityState={{ selected: chosen }}
      onPress={press}
      // The one you left is filled and ringed rather than merely tinted: this
      // is the only place the app says what you reacted with, so it has to be
      // readable at a glance.
      className={`h-10 w-10 items-center justify-center rounded-full active:opacity-60 ${
        chosen ? 'border border-white/70 bg-white/35' : ''
      }`}>
      {/* Escapes the button and the bar on the way up — nothing in the column
          clips, so it is free to travel. Deaf to touches for the whole flight,
          or it would sit over the tap-to-advance half of the screen while it
          rises. Sizes are inline styles rather than classes because these are
          `Animated` components, which are wrappers rather than the plain
          elements class names are wired up for. */}
      {rising ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            opacity: rise.interpolate({
              inputRange: [0, 0.15, 1],
              outputRange: [0, 1, 0],
            }),
            transform: [
              {
                translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, -96] }),
              },
              {
                scale: rise.interpolate({
                  inputRange: [0, 0.3, 1],
                  outputRange: [0.6, 1.4, 1],
                }),
              },
            ],
          }}>
          <Text style={{ fontSize: 22, lineHeight: 28 }}>{emoji}</Text>
        </Animated.View>
      ) : null}

      <Animated.View style={{ transform: [{ scale }] }}>
        <Text style={{ fontSize: 21, lineHeight: 28 }}>{emoji}</Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Watch stories, starting with one person's and carrying on through everyone
 * else who has something up.
 *
 * Each frame gets ten seconds and then hands over. Running out of one person's
 * run moves to the next person rather than ending — only running out of people
 * closes the screen, which is what makes a rail something you can start at one
 * end of and leave running.
 *
 * Tapping the right half skips ahead, the left half goes back, and holding
 * still pauses — the gestures people already expect from every other app that
 * does this.
 *
 * Everything is fetched here rather than passed in, so the screen works from a
 * deep link and from a rail tap alike.
 */
export default function StoryViewerScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const confirm = useConfirm();
  const alert = useAlert();

  const [reels, setReels] = useState<StoryReel[]>([]);
  // Which person, and which of their stories. -1 until the fetch says who the
  // requested person is, or that they have nothing up any more.
  const [reelIndex, setReelIndex] = useState(-1);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);

  // Held in state rather than a ref, because a ref may not be read while
  // rendering and this value is handed straight to a style. The initialiser
  // form means the one `Animated.Value` is built once and never replaced.
  const [progress] = useState(() => new Animated.Value(0));
  // Which stories have been reported as watched, so a replay does not send the
  // same one twice.
  const reported = useRef(new Set<string>());
  // How much of the current story has already played, carried across a pause.
  const elapsed = useRef(0);

  const reel: StoryReel | undefined = reels[reelIndex];
  // Memoised so the empty fallback is not a new array on every render, which
  // would re-make every callback that depends on the run.
  const stories: Story[] = useMemo(() => reel?.stories ?? [], [reel]);
  const current: Story | undefined = stories[index];

  /**
   * Where to drop into a run: the first frame not already watched.
   *
   * Someone arriving at a person's stories wants what is new, not to sit
   * through what they saw this morning — and that is as true crossing in from
   * the person before as it is opening the ring directly. Falls back to the
   * start for a run that has been seen through, which then simply replays.
   *
   * Declared above the fetch below because a dependency array is built while
   * rendering, and naming a `const` declared further down reads it before it
   * exists.
   */
  const startOf = useCallback((item: StoryReel) => {
    const from = item.stories.findIndex((story) => !story.viewed);
    return from > 0 ? from : 0;
  }, []);

  useEffect(() => {
    if (!token || !userId) return;

    let cancelled = false;
    (async () => {
      try {
        const fetched = await fetchStoryReels(token);
        if (cancelled) return;

        setReels(fetched);

        // -1 where the person asked for has nothing live any more — their last
        // story expired between the rail drawing and the ring being tapped.
        const at = fetched.findIndex((item) => item.author.id === userId);
        setReelIndex(at);

        setIndex(at >= 0 ? startOf(fetched[at]) : 0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, userId, startOf]);

  const close = useCallback(() => goBack(), []);

  /**
   * The next person in either direction who still has something to show.
   *
   * Empty runs are stepped over rather than landed on: deleting your last story
   * leaves a reel with nothing in it, and stopping there would show the
   * "nothing here" panel in the middle of a sequence that has more to come.
   */
  const reelWithStories = useCallback(
    (from: number, step: 1 | -1) => {
      for (let i = from; i >= 0 && i < reels.length; i += step) {
        if (reels[i].stories.length > 0) return i;
      }
      return -1;
    },
    [reels]
  );

  const goTo = useCallback(
    (next: number) => {
      if (next < 0) {
        // Back past the first frame steps into the person before, landing on
        // their last — the mirror of how going forward crosses over.
        const previous = reelWithStories(reelIndex - 1, -1);
        if (previous === -1) {
          setIndex(0);
          return;
        }
        setReelIndex(previous);
        setIndex(Math.max(reels[previous].stories.length - 1, 0));
        return;
      }

      if (next >= stories.length) {
        // The end of this run is the start of the next person's. Only running
        // out of people is the end of watching.
        const following = reelWithStories(reelIndex + 1, 1);
        if (following === -1) {
          close();
          return;
        }
        setReelIndex(following);
        setIndex(startOf(reels[following]));
        return;
      }

      setIndex(next);
    },
    [stories.length, reelIndex, reels, reelWithStories, startOf, close]
  );

  // Back to the start of the bar whenever the story itself changes — and only
  // then, which is what separates a new frame from resuming a held one. Runs
  // before the countdown below, since effects fire in the order they are
  // declared.
  useEffect(() => {
    progress.setValue(0);
    elapsed.current = 0;
  }, [current?.id, progress]);

  // The countdown, and what decides when to hand over.
  useEffect(() => {
    if (!current || paused) return;

    const startedAt = Date.now();
    const animation = Animated.timing(progress, {
      toValue: 1,
      // What is left of the ten seconds, not the whole of it: holding to pause
      // and letting go should carry on from where the bar stopped rather than
      // hand back time already watched.
      duration: Math.max(DURATION_MS - elapsed.current, 0),
      easing: Easing.linear,
      useNativeDriver: false,
    });

    animation.start(({ finished }) => {
      if (finished) goTo(index + 1);
    });

    return () => {
      animation.stop();
      // Banked on the way out, whether that is a pause or a move to the next
      // story. The reset above clears it in the latter case.
      elapsed.current += Date.now() - startedAt;
    };
  }, [current, index, paused, progress, goTo]);

  // Reporting a view is fire and forget: it moves a counter and a ring, and a
  // failure is not worth interrupting someone mid-story to mention.
  useEffect(() => {
    if (!current || !token || reported.current.has(current.id)) return;

    reported.current.add(current.id);
    void markStoryViewed(current.id, token).catch(() => {
      reported.current.delete(current.id);
    });
  }, [current, token]);

  // Hold the countdown whenever this screen is not the one in front — the
  // viewers list opens over it, and a story that kept running underneath would
  // be gone, or be a different one, by the time the list was closed.
  useFocusEffect(
    useCallback(() => {
      setPaused(false);
      return () => setPaused(true);
    }, [])
  );

  /** Rewrite the run being watched, leaving everybody else's alone. */
  const updateStories = useCallback(
    (mutate: (stories: Story[]) => Story[]) =>
      setReels((previous) =>
        previous.map((item, i) =>
          i === reelIndex ? { ...item, stories: mutate(item.stories) } : item
        )
      ),
    [reelIndex]
  );

  /**
   * React to somebody's story, or take the reaction back.
   *
   * Applied before the request is sent: a tapped emoji has to light up now, and
   * the frame it belongs to may only be on screen for another second. A failure
   * puts it back rather than leaving a reaction that only this device believes
   * in.
   */
  const react = useCallback(
    (type: StoryReactionType) => {
      if (!current || !token) return;

      const previousReaction = current.viewer_reaction ?? null;
      // Tapping the one already chosen clears it, the way a like toggles.
      const next = previousReaction === type ? null : type;
      const storyId = current.id;

      const apply = (reaction: StoryReactionType | null) =>
        updateStories((list) =>
          list.map((story) =>
            story.id === storyId ? { ...story, viewer_reaction: reaction } : story
          )
        );

      apply(next);

      const request = next
        ? reactToStory(storyId, next, token)
        : removeStoryReaction(storyId, token);

      void request.catch(() => apply(previousReaction));
    },
    [current, token, updateStories]
  );

  /**
   * Take your own story down.
   *
   * Confirmed first, because it is immediate and there is no undo. The
   * countdown holds while the question is up — a story sliding out from under
   * a dialog would leave the answer applying to the wrong one.
   */
  const remove = useCallback(async () => {
    if (!current || !token) return;

    setPaused(true);

    const confirmed = await confirm({
      title: 'Delete this story?',
      message: 'It disappears for everyone straight away.',
      confirmLabel: 'Delete',
      destructive: true,
    });

    if (!confirmed) {
      setPaused(false);
      return;
    }

    const remaining = stories.filter((story) => story.id !== current.id);

    try {
      await deleteStory(current.id, token);
      updateStories(() => remaining);

      // The one that went was the last still ahead, so this run is over —
      // carry on into the next person's rather than sitting on an index
      // pointing past the end.
      if (index >= remaining.length) {
        const following = reelWithStories(reelIndex + 1, 1);
        if (following === -1) {
          close();
        } else {
          setReelIndex(following);
          setIndex(0);
        }
      }
    } catch (caught) {
      await alert({
        title: 'Could not delete that story',
        message: caught instanceof Error ? caught.message : 'Please try again.',
      });
    } finally {
      setPaused(false);
    }
  }, [
    current,
    token,
    stories,
    index,
    reelIndex,
    reelWithStories,
    updateStories,
    close,
    confirm,
    alert,
  ]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator size="small" color="#FFFFFF" />
      </View>
    );
  }

  if (!current) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-black px-10">
        <Text className="text-center font-sans text-[15px] leading-[22px] text-white/70">
          There is nothing here right now. Stories disappear after a day.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={close}
          className="rounded-full bg-white/15 px-5 py-2.5 active:opacity-70">
          <Text className="font-body-semibold text-[15px] leading-5 text-white">Close</Text>
        </Pressable>
      </View>
    );
  }

  const author = reel?.author;
  const isMine = author?.id === user?.id;
  // Absent on somebody else's story, where the server does not send them — and
  // neither is drawn there anyway.
  const seenBy = current.views_count ?? 0;
  const reactionsReceived = current.reactions_count ?? 0;
  const kindsReceived = current.reaction_types ?? [];
  // Another frame here, or another person after this one. Only the very end of
  // everything says "Done".
  const hasMore = index + 1 < stories.length || reelWithStories(reelIndex + 1, 1) !== -1;

  return (
    <View className="flex-1 bg-black">
      {/* Through the placeholder wrapper, not the bare image, for the URL it
          rewrites on the way: the server builds `image_url` from APP_URL — the
          Herd hostname — which a device reaching the API through a tunnel or a
          LAN address cannot resolve. It also carries the ngrok header, without
          which the tunnel answers an image request with its HTML interstitial
          under a 200, and the photo silently never appears. */}
      <ImageWithPlaceholder
        source={{ uri: current.image_url }}
        className="absolute inset-0 h-full w-full"
        contentFit="contain"
        accessibilityLabel={`${author?.full_name ?? 'Story'} — ${index + 1} of ${stories.length}`}
      />

      {/* Both halves of the screen are the control: tap right for the next,
          left for the last, hold either to pause. They sit under the chrome so
          the close button and the caption still take their own taps. */}
      <View className="absolute inset-0 flex-row">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous story"
          onPress={() => goTo(index - 1)}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          delayLongPress={200}
          className="flex-1"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next story"
          onPress={() => goTo(index + 1)}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          delayLongPress={200}
          className="flex-1"
        />
      </View>

      <View style={{ paddingTop: insets.top + 8 }} pointerEvents="box-none">
        <ProgressBars count={stories.length} index={index} progress={progress} />

        <View className="mt-3 flex-row items-center gap-3 px-4" pointerEvents="box-none">
          <ImageWithPlaceholder
            source={{ uri: author?.avatar_url ?? null }}
            className="h-9 w-9 rounded-full"
            accessibilityLabel={`${author?.full_name ?? 'Author'} profile photo`}>
            <View className="h-9 w-9 items-center justify-center rounded-full bg-primary">
              <Text className="font-heading-bold text-[13px] leading-[18px] text-white">
                {(author?.full_name.trim()[0] ?? '?').toUpperCase()}
              </Text>
            </View>
          </ImageWithPlaceholder>

          <View className="flex-1">
            <Text numberOfLines={1} className="font-body-semibold text-[15px] leading-5 text-white">
              {isMine ? 'Your story' : (author?.full_name ?? '')}
            </Text>
            <Text className="font-sans text-[12px] leading-4 text-white/70">
              {timeAgo(current.created_at)}
            </Text>
          </View>

          {/* Only the poster may take one down, and the server agrees — so the
              button is not offered where it would only earn a 403. */}
          {isMine ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete this story"
              onPress={() => void remove()}
              hitSlop={10}
              className="p-1 active:opacity-60">
              <SymbolView
                name={{ ios: 'trash', android: 'delete', web: 'delete' }}
                size={18}
                weight="bold"
                tintColor="#FFFFFF"
              />
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close stories"
            onPress={close}
            hitSlop={10}
            className="p-1 active:opacity-60">
            <SymbolView
              name={{ ios: 'xmark', android: 'close', web: 'close' }}
              size={18}
              weight="bold"
              tintColor="#FFFFFF"
            />
          </Pressable>
        </View>
      </View>

      <View
        className="absolute inset-x-0 bottom-0 gap-3 px-4"
        style={{ paddingBottom: insets.bottom + 16 }}
        pointerEvents="box-none">
        {current.caption ? (
          <Text className="font-sans text-[15px] leading-[22px] text-white">{current.caption}</Text>
        ) : null}

        {/* Reactions belong to other people's stories. Reacting to your own is
            allowed by the API but is not something to invite, and the room is
            better spent on what came back. */}
        {isMine ? null : (
          // The full width of the screen rather than a pill hugging its
          // contents, with the five spread across it: every reaction then sits
          // under its own patch of thumb, and none of them is the one that
          // happens to be easiest to hit.
          <View className="flex-row items-center justify-between rounded-full bg-black/40 px-4 py-2">
            {STORY_REACTIONS.map((reaction) => (
              <ReactionButton
                key={reaction.type}
                emoji={reaction.emoji}
                label={reaction.label}
                chosen={current.viewer_reaction === reaction.type}
                onPress={() => react(reaction.type)}
              />
            ))}
          </View>
        )}

        <View className="flex-row items-center gap-2">
          {/* Only the poster is told who watched, and the server agrees — so
              the count is not offered where tapping it would earn a 403. */}
          {isMine ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Seen by ${seenBy}. See who watched.`}
              onPress={() =>
                router.push({
                  pathname: '/story/viewers/[storyId]',
                  params: { storyId: current.id },
                })
              }
              className="flex-row items-center gap-2 rounded-full bg-white/20 px-4 py-2.5 active:opacity-70">
              <SymbolView
                name={{ ios: 'eye', android: 'visibility', web: 'visibility' }}
                size={14}
                weight="bold"
                tintColor="#FFFFFF"
              />
              <Text className="font-body-semibold text-[15px] leading-5 text-white">
                {seenBy === 1 ? 'Seen by 1' : `Seen by ${seenBy}`}
              </Text>
            </Pressable>
          ) : null}

          {/* What came back, on your own story: the kinds that arrived and how
              many in total. Who left which is a tap away in the viewers list. */}
          {isMine && reactionsReceived > 0 ? (
            <View
              accessibilityRole="text"
              accessibilityLabel={`${reactionsReceived} ${
                reactionsReceived === 1 ? 'reaction' : 'reactions'
              }`}
              className="flex-row items-center gap-1.5 rounded-full bg-white/20 px-3 py-2.5">
              <Text className="text-[15px] leading-5">
                {kindsReceived.map(reactionEmoji).join('')}
              </Text>
              <Text className="font-body-semibold text-[15px] leading-5 text-white">
                {reactionsReceived}
              </Text>
            </View>
          ) : null}

          <View className="flex-1" />

          {/* An explicit way forward, for anyone who does not know the screen is
              tappable — and the only way to reach the end deliberately. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hasMore ? 'Next story' : 'Finish watching'}
            onPress={() => goTo(index + 1)}
            className="flex-row items-center justify-center gap-2 rounded-full bg-white/20 px-5 py-2.5 active:opacity-70">
            <Text className="font-body-semibold text-[15px] leading-5 text-white">
              {hasMore ? 'Next' : 'Done'}
            </Text>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              size={13}
              weight="bold"
              tintColor="#FFFFFF"
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
