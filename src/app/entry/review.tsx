import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
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

import { EntryHeader, PILLAR_THEME, useDismissEntryFlow } from '@/components/entry-chrome';
import { TextArea } from '@/components/ui/text-area';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { buildWins, OTHER_ACTIVITY, useEntryDraft, type Pillar } from '@/lib/entry-draft';
import { useFeed } from '@/lib/feed-context';
import { formatDuration } from '@/lib/meditation';
import { describeWinErrors } from '@/lib/posts';
import { useToast } from '@/lib/toast';

type Summary = {
  pillar: Pillar;
  title: string;
  detail: string;
  /** Where Edit sends you — `dismissTo` pops back rather than stacking. */
  href: '/entry/meditation' | '/entry/learning' | '/entry/movement';
};

const photoCount = (n: number) => `${n} photo${n === 1 ? '' : 's'} attached`;

/**
 * The last step: a caption, and a read-back of everything the three steps
 * collected. Only pillars that were actually touched appear — a win made of one
 * walk should not be shown as two-thirds empty.
 */
export default function ReviewStepScreen() {
  const insets = useSafeAreaInsets();
  const { draft, setCaption, submit, targets, lockedToCircle } = useEntryDraft();
  const { prepend } = useFeed();
  const { refreshUser } = useAuth();
  const dismissFlow = useDismissEntryFlow();
  const showToast = useToast();
  const [sharing, setSharing] = useState(false);

  const { meditation, learning, movement, caption } = draft;

  const summaries: Summary[] = [];

  // A length is the only way to log the step, so it is also the only thing that
  // puts the pillar on this list.
  if (meditation.minutes !== null) {
    summaries.push({
      pillar: 'meditation',
      title: 'Meditation',
      detail: `${formatDuration(meditation.minutes)}${
        meditation.usedTimer
          ? meditation.completed
            ? ' · sat with the timer'
            : ' · stopped early'
          : ''
      }`,
      href: '/entry/meditation',
    });
  }

  if (learning.completed || learning.learned.trim() || learning.photos.length > 0) {
    summaries.push({
      pillar: 'learning',
      title: 'Learning',
      detail:
        learning.learned.trim() ||
        (learning.photos.length > 0 ? photoCount(learning.photos.length) : 'Marked as done'),
      href: '/entry/learning',
    });
  }

  if (movement.completed || movement.activity || movement.photos.length > 0) {
    // "Others" is a sentinel, never a label — show what they typed, or fall
    // back to the plain pillar name if they picked it and wrote nothing.
    const label =
      movement.activity === OTHER_ACTIVITY ? movement.otherActivity.trim() : movement.activity;

    summaries.push({
      pillar: 'movement',
      title: label ? `Movement · ${label}` : 'Movement',
      detail: movement.photos.length > 0 ? photoCount(movement.photos.length) : 'Marked as done',
      href: '/entry/movement',
    });
  }

  // Every win the API accepts is built around a pillar's own field, so there is
  // nothing to send for a caption on its own — nor for a pillar carrying only
  // photos, which cannot be uploaded yet.
  const wins = buildWins(draft);
  const canShare = wins.length > 0 && !sharing;

  const share = async () => {
    if (!canShare) return;
    setSharing(true);
    try {
      const post = await submit();

      // The server handed the post back, so the feed can show it without a
      // round trip. Counters live on the user record, which did just move.
      prepend(post);
      void refreshUser();

      showToast(wins.length === 1 ? 'Win shared 🌱' : `${wins.length} wins shared 🌱`);
      // Closes the modal outright, whichever step the flow is standing on.
      dismissFlow();
    } catch (caught) {
      setSharing(false);
      Alert.alert(
        'Could not share',
        // A 422 keys its errors by position in the array we sent, so the step
        // at fault is only knowable by looking the index back up.
        caught instanceof ApiError && Object.keys(caught.fieldErrors).length > 0
          ? describeWinErrors(caught.fieldErrors, wins)
          : caught instanceof Error
            ? caught.message
            : 'Something went wrong. Please try again.'
      );
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface-card"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <EntryHeader />

      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center px-4"
        contentContainerStyle={{
          paddingTop: 24,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <View className="gap-1">
          <Text className="font-heading-bold text-2xl leading-8 text-ink">
            Review your small win
          </Text>
          <Text className="font-sans text-[15px] leading-[22px] text-ink-muted">
            Add a caption and share it with the community.
          </Text>
        </View>

        <View className="gap-3 pt-5">
          <TextArea
            placeholder="Say a few words about today… 🌱"
            value={caption}
            onChangeText={setCaption}
            className="min-h-28 rounded-2xl border border-hairline bg-surface px-4 py-3.5 font-sans text-[15px] text-ink"
            maxLength={1000}
          />

          {summaries.length > 0
            ? summaries.map((summary) => {
                const theme = PILLAR_THEME[summary.pillar];
                return (
                  <View
                    key={summary.pillar}
                    className="flex-row items-center gap-3 rounded-2xl border border-hairline bg-surface-card p-3">
                    <View
                      className="h-11 w-11 items-center justify-center rounded-xl"
                      style={{ backgroundColor: theme.tint }}>
                      <SymbolView name={theme.icon} size={20} tintColor={theme.accent} />
                    </View>
                    <View className="flex-1">
                      <Text
                        numberOfLines={1}
                        className="font-body-semibold text-[15px] leading-5 text-ink">
                        {summary.title}
                      </Text>
                      <Text
                        numberOfLines={1}
                        className="mt-0.5 font-sans text-[13px] leading-[18px] text-ink-muted">
                        {summary.detail}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${summary.title}`}
                      onPress={() => router.dismissTo(summary.href)}
                      hitSlop={8}
                      className="px-1 active:opacity-60">
                      <Text className="font-body-semibold text-[15px] leading-5 text-secondary">
                        Edit
                      </Text>
                    </Pressable>
                  </View>
                );
              })
            : null}

          {wins.length === 0 ? (
            <Text className="px-1 font-sans text-sm leading-5 text-ink-muted">
              {summaries.length > 0
                ? // Reachable with photos but no length, note or activity — the
                  // cards above show, yet none of them can be posted.
                  'Photos cannot be shared on their own yet. Go back and add a length, a note, or an activity.'
                : 'Nothing logged yet. Go back and fill in a step — a caption on its own cannot be shared.'}
            </Text>
          ) : null}
        </View>

        {/* Where it is going, said before it goes — a statement, not a choice.
            Everyone can read it either way; circles are extra walls it appears
            on, not a smaller audience. One post reaches every circle listed, so
            nobody sees it twice for being in more than one of them. */}
        {targets.length > 0 ? (
          <View className="mt-6 flex-row items-center gap-2.5 rounded-2xl bg-surface-card px-4 py-3.5">
            <SymbolView
              name={{ ios: 'person.2', android: 'group', web: 'group' }}
              size={16}
              tintColor={Colors.light.textSecondary}
            />

            <View className="flex-1">
              <Text className="font-sans text-[13px] leading-[18px] text-ink-muted">
                Everyone will see this. Also posting to{' '}
                <Text className="font-body-semibold text-ink">
                  {lockedToCircle || targets.length === 1
                    ? targets[0].name
                    : `all ${targets.length} of your circles`}
                </Text>
              </Text>
              {!lockedToCircle && targets.length > 1 ? (
                <Text className="mt-0.5 font-sans text-[12px] leading-4 text-ink-muted">
                  One post — nobody sees it more than once.
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canShare }}
          disabled={!canShare}
          onPress={share}
          className={`mt-6 items-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500 py-4 active:opacity-85 ${
            canShare ? '' : 'opacity-40'
          }`}
          style={canShare ? { boxShadow: '0 8px 20px rgba(34, 197, 94, 0.35)' } : undefined}>
          <Text className="font-body-semibold text-base leading-6 text-white">
            {sharing ? 'Sharing…' : 'Share win'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
