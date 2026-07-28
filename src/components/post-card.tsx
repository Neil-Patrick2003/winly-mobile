import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import { PILLAR_THEME } from '@/components/entry-chrome';
import { ImageWithPlaceholder } from '@/components/ui/image';
import { Colors } from '@/constants/theme';
import { humanizeMovementType, type Media, type Post, type Win } from '@/lib/posts';

/** "now", "6m", "3h", "2d", then a plain date once a month has passed. */
function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';

  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m`;

  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h`;

  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)}d`;

  const weeks = days / 7;
  if (weeks < 5) return `${Math.floor(weeks)}w`;

  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function Count({
  icon,
  value,
  label,
}: {
  icon: SymbolViewProps['name'];
  value: number;
  label: string;
}) {
  return (
    <View accessibilityLabel={`${value} ${label}`} className="flex-row items-center gap-1.5">
      <SymbolView name={icon} size={16} tintColor={Colors.light.textSecondary} />
      <Text className="font-sans text-[13px] leading-[18px] text-ink-muted">{value}</Text>
    </View>
  );
}

/** The one-line summary for a win, per its type. */
function winLabel(win: Win) {
  switch (win.type) {
    case 'meditation':
      // `completed: false` means the timer was stopped short, which is still a
      // win — it just should not read as the full sit.
      return `${win.duration_minutes} min${win.completed ? '' : ' · stopped early'}`;
    case 'learning':
      return PILLAR_THEME.learning.label;
    case 'movement':
      return win.movement_type
        ? humanizeMovementType(win.movement_type)
        : PILLAR_THEME.movement.label;
  }
}

/** A tinted pill per win, in the pillar's own colour. */
function WinChip({ win }: { win: Win }) {
  const theme = PILLAR_THEME[win.type];

  return (
    <View
      className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
      style={{ backgroundColor: theme.tint }}>
      <SymbolView name={theme.icon} size={13} tintColor={theme.accent} />
      <Text
        className="font-body-semibold text-[13px] leading-[18px]"
        style={{ color: theme.accent }}>
        {winLabel(win)}
      </Text>
    </View>
  );
}

/** Tiles the card draws; anything past this is counted on the last one. */
const MAX_TILES = 2;

/**
 * What a tile is shaped like before its image has reported anything, and the
 * range a reported shape is held to.
 *
 * The API sends no dimensions, so `onLoad` is the first time the real ratio is
 * knowable and the card has to be laid out against something until then. The
 * clamp keeps the feed readable at the extremes — a panorama would otherwise
 * collapse to a sliver, and a full-length screenshot would push everything
 * below it off the screen.
 */
const DEFAULT_RATIO = 4 / 3;
const MIN_RATIO = 3 / 4;
const MAX_RATIO = 16 / 9;

const clampRatio = (width: number, height: number) =>
  width > 0 && height > 0
    ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height))
    : DEFAULT_RATIO;

/**
 * A post's attachments, at their own proportions rather than a fixed crop.
 *
 * One ratio governs the whole block, measured from the first image: a pair has
 * to share a height to read as a row, so the second tile fills that shape with
 * `cover` instead of setting one of its own. A lone attachment therefore always
 * gets its true shape, which is the common case.
 */
function MediaGrid({ media }: { media: Media[] }) {
  const shown = media.slice(0, MAX_TILES);
  const hidden = media.length - shown.length;
  const [ratio, setRatio] = useState(DEFAULT_RATIO);

  return (
    <View className="mt-3 flex-row gap-2">
      {shown.map((item, index) => {
        const more = index === shown.length - 1 && hidden > 0;

        return (
          <View
            key={item.id}
            style={{ aspectRatio: ratio }}
            className={`overflow-hidden rounded-2xl ${shown.length === 1 ? 'w-full' : 'w-[48.5%]'}`}>
            <ImageWithPlaceholder
              source={{ uri: item.url }}
              className="h-full w-full"
              accessibilityLabel={
                more
                  ? `Attached photo, and ${hidden} more`
                  : item.kind === 'video'
                    ? 'Attached video'
                    : 'Attached photo'
              }
              // Only the first tile is asked: it is the one the shared ratio
              // comes from, and letting the second overwrite it would reshape
              // the row depending on which image happened to load last.
              onLoad={
                index === 0
                  ? ({ source }) => setRatio(clampRatio(source.width, source.height))
                  : undefined
              }
            />

            {item.kind === 'video' ? (
              <View className="absolute inset-0 items-center justify-center">
                <SymbolView
                  name={{
                    ios: 'play.circle.fill',
                    android: 'play_circle',
                    web: 'play_circle',
                  }}
                  size={38}
                  tintColor="#FFFFFF"
                />
              </View>
            ) : null}

            {more ? (
              <View className="absolute inset-0 items-center justify-center bg-black/45">
                <Text className="font-heading-bold text-2xl leading-8 text-white">+{hidden}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** How much of a note the card shows before it has to be opened. */
const NOTE_MAX_LINES = 3;

/** Has to match the `leading-[22px]` the note is rendered with. */
const NOTE_LINE_HEIGHT = 22;

/**
 * A learning note, clamped to three lines with a way to open it.
 *
 * Whether it actually overflows is measured rather than guessed: a copy laid
 * out off-screen at the same width reports the unclamped height, and three
 * lines' worth is the threshold. The measurement uses `onLayout` and not
 * `onTextLayout` because React Native Web does not implement the latter — the
 * toggle would simply never appear on web.
 */
function LearningNote({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [fullHeight, setFullHeight] = useState<number | null>(null);

  // A pixel of slack, because line heights do not always land on whole numbers.
  const overflows = fullHeight !== null && fullHeight > NOTE_MAX_LINES * NOTE_LINE_HEIGHT + 1;

  return (
    <>
      {fullHeight === null ? (
        // Absolute, so it takes the panel's content width without taking part
        // in the layout. Dropped once it has answered the one question.
        <Text
          aria-hidden
          pointerEvents="none"
          onLayout={(event: LayoutChangeEvent) => setFullHeight(event.nativeEvent.layout.height)}
          style={{ position: 'absolute', left: 0, right: 0, opacity: 0 }}
          className="font-sans text-[15px] leading-[22px] text-ink">
          {text}
        </Text>
      ) : null}

      <Text
        numberOfLines={expanded ? undefined : NOTE_MAX_LINES}
        className="font-sans text-[15px] leading-[22px] text-ink">
        {text}
      </Text>

      {overflows ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((value) => !value)}
          hitSlop={6}
          className="self-start active:opacity-60">
          <Text className="font-body-semibold text-[13px] leading-[18px] text-secondary">
            {expanded ? 'See less' : 'See more'}
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

/**
 * One post in the feed.
 *
 * `wins` is always an array and may be empty, in which case the post is just an
 * author, a caption and a time.
 */
export function PostCard({ post }: { post: Post }) {
  const { author, wins } = post;
  // The substance of a learning win is its text, which is too long for a pill.
  const learning = wins.find((win) => win.type === 'learning');
  // Attachments hang off individual wins, but the card shows them as one set —
  // `position` is what orders them, not the win they came from.
  const media = wins.flatMap((win) => win.media).sort((a, b) => a.position - b.position);

  return (
    <View className="mx-5 mt-3 rounded-3xl bg-surface-card p-4">
      <View className="flex-row items-center gap-3">
        <ImageWithPlaceholder
          source={{ uri: author.avatar_url }}
          className="h-11 w-11 rounded-full"
          accessibilityLabel={`${author.full_name} profile photo`}>
          <View className="h-11 w-11 items-center justify-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500">
            <Text className="font-heading-bold text-base leading-6 text-white">
              {(author.full_name.trim()[0] ?? '?').toUpperCase()}
            </Text>
          </View>
        </ImageWithPlaceholder>

        <View className="flex-1">
          <Text numberOfLines={1} className="font-body-semibold text-[15px] leading-5 text-ink">
            {author.full_name}
          </Text>
          <Text numberOfLines={1} className="font-sans text-[13px] leading-[18px] text-ink-muted">
            {/* `username` is nullable, and a bare "@" would look like a bug. */}
            {author.username ? `@${author.username} · ` : ''}
            {timeAgo(post.created_at)}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More options"
          hitSlop={8}
          className="p-1 active:opacity-60">
          <SymbolView
            name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
            size={18}
            tintColor={Colors.light.textSecondary}
          />
        </Pressable>
      </View>

      {wins.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {wins.map((win) => (
            <WinChip key={win.type} win={win} />
          ))}
        </View>
      ) : null}

      {post.caption ? (
        <Text className="mt-3 font-sans text-[15px] leading-[22px] text-ink">{post.caption}</Text>
      ) : null}

      {learning?.type === 'learning' ? (
        <View className="mt-3 gap-1 rounded-2xl bg-surface p-3.5">
          <LearningNote text={learning.learned_text} />
          {learning.reference_source ? (
            <Text numberOfLines={1} className="font-sans text-[13px] leading-[18px] text-ink-muted">
              {learning.reference_source}
            </Text>
          ) : null}
        </View>
      ) : null}

      {media.length > 0 ? <MediaGrid media={media} /> : null}

      <View className="mt-3.5 flex-row items-center gap-5">
        <Count
          icon={{
            ios: 'heart',
            android: 'favorite_border',
            web: 'favorite_border',
          }}
          value={post.likes_count}
          label="likes"
        />
        <Count
          icon={{
            ios: 'bubble.right',
            android: 'chat_bubble_outline',
            web: 'chat_bubble_outline',
          }}
          value={post.comments_count}
          label="comments"
        />
        <Count
          icon={{
            ios: 'arrowshape.turn.up.right',
            android: 'share',
            web: 'share',
          }}
          value={post.shares_count}
          label="shares"
        />
      </View>
    </View>
  );
}
