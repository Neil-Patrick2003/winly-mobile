import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { PILLAR_THEME } from '@/components/entry-chrome';
import { ImageWithPlaceholder } from '@/components/ui/image';
import { MenuButton, type MenuItem } from '@/components/ui/menu';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { useFeed } from '@/lib/feed-context';
import {
  createComment,
  humanizeMovementType,
  setFollowing as setFollowingRemote,
  setLiked as setLikedRemote,
  COMMENT_MAX,
  type Media,
  type Post,
  type Win,
} from '@/lib/posts';
import { timeAgo } from '@/lib/time';
import { useToast } from '@/lib/toast';

/**
 * One counter under a post.
 *
 * Pressable only when given an `onPress` — a plain count stays a plain `View`,
 * so nothing that cannot be acted on advertises itself to a screen reader as a
 * button. `tint` colours both glyph and number when the action is on, which is
 * what carries the state; the icon is expected to change shape too, since
 * colour alone is not a signal everyone can read.
 */
function Count({
  icon,
  value,
  label,
  actionLabel,
  tint,
  onPress,
}: {
  icon: SymbolViewProps['name'];
  value: number;
  label: string;
  /** What the press does, for a screen reader. Required to make it pressable. */
  actionLabel?: string;
  tint?: string;
  onPress?: () => void;
}) {
  const body = (
    <>
      <SymbolView name={icon} size={16} tintColor={tint ?? Colors.light.textSecondary} />
      <Text
        className="font-sans text-[13px] leading-[18px] text-ink-muted"
        style={tint ? { color: tint } : undefined}>
        {value}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View accessibilityLabel={`${value} ${label}`} className="flex-row items-center gap-1.5">
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${actionLabel} — ${value} ${label}`}
      accessibilityState={{ selected: Boolean(tint) }}
      onPress={onPress}
      hitSlop={8}
      className="flex-row items-center gap-1.5 active:opacity-60">
      {body}
    </Pressable>
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

/**
 * Every attachment, stacked full width at its own proportions.
 *
 * What the feed grid cannot do: it caps at two tiles and counts the rest under
 * a "+3", which is right for a card being scrolled past and wrong for the
 * screen someone opened to look at the post. Nothing is cropped to a shared
 * shape here either — each image measures itself, so a portrait and a
 * landscape shot both keep theirs.
 */
function MediaStack({ media }: { media: Media[] }) {
  // `-mx-4` cancels the detail block's own padding, so photos run edge to edge
  // while the words around them stay inset.
  return (
    <View className="-mx-4 mt-3 gap-1">
      {media.map((item, index) => (
        <StackedTile key={item.id} item={item} position={index + 1} total={media.length} />
      ))}
    </View>
  );
}

function StackedTile({ item, position, total }: { item: Media; position: number; total: number }) {
  // Its own, not shared: a stack has no row to keep aligned.
  const [ratio, setRatio] = useState(DEFAULT_RATIO);

  return (
    <View style={{ aspectRatio: ratio }} className="w-full overflow-hidden">
      <ImageWithPlaceholder
        source={{ uri: item.url }}
        className="h-full w-full"
        contentFit="cover"
        accessibilityLabel={`${item.kind === 'video' ? 'Attached video' : 'Attached photo'} ${position} of ${total}`}
        onLoad={({ source }) => setRatio(clampRatio(source.width, source.height))}
      />

      {item.kind === 'video' ? (
        <View className="absolute inset-0 items-center justify-center">
          <SymbolView
            name={{ ios: 'play.circle.fill', android: 'play_circle', web: 'play_circle' }}
            size={44}
            tintColor="#FFFFFF"
          />
        </View>
      ) : null}
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

      {/*
        A `Text` with `onPress`, not a `Pressable`.
        This sits inside `PostBody`, which is itself pressable so that tapping
        the post opens it — and a `Pressable` here would be a button nested in a
        button, which React refuses on web. `Text` takes the press and renders
        as a span, so the two controls can overlap without the DOM objecting.
      */}
      {overflows ? (
        <Text
          accessibilityRole="button"
          onPress={() => setExpanded((value) => !value)}
          suppressHighlighting
          className="mt-1 self-start font-body-semibold text-[13px] leading-[18px] text-secondary">
          {expanded ? 'See less' : 'See more'}
        </Text>
      ) : null}
    </>
  );
}

/**
 * The follow state of a post's author, sitting on the corner of their avatar.
 *
 * A plus is an invitation and a tick is a statement, so the two are drawn
 * differently on purpose: the plus carries the brand green because it is the
 * thing to do next, while the tick recedes to grey because it is just how
 * things already are. Both are pressable — an accidental unfollow costs one tap
 * to undo, and the toast says which way it went.
 *
 * Only shown on other people's posts. The border matches the card rather than
 * the avatar, which is what makes the badge read as sitting on top of it.
 */
function FollowBadge({
  following,
  name,
  onPress,
}: {
  following: boolean;
  name: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={following ? `Unfollow ${name}` : `Follow ${name}`}
      accessibilityState={{ selected: following }}
      onPress={onPress}
      hitSlop={8}
      className="absolute -bottom-0.5 -right-0.5 h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-surface-card active:opacity-70"
      style={{ backgroundColor: following ? theme.textSecondary : theme.primary }}>
      <SymbolView
        name={
          following
            ? { ios: 'checkmark', android: 'check', web: 'check' }
            : { ios: 'plus', android: 'add', web: 'add' }
        }
        size={9}
        weight="bold"
        tintColor="#FFFFFF"
      />
    </Pressable>
  );
}

/**
 * The body of a post, pressable or not.
 *
 * A plain `View` on the detail screen, where there is nowhere further to go.
 * In the feed it becomes the way in — and stays a `View` structurally, so the
 * "See more" toggle and anything else inside keeps its own press: React Native
 * gives the touch to the innermost responder that wants it.
 */
function PostBody({
  onPress,
  label,
  children,
}: {
  onPress?: () => void;
  label: string;
  children: ReactNode;
}) {
  if (!onPress) return <>{children}</>;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      {children}
    </Pressable>
  );
}

/** The icons the overflow menu draws, per action and per state. */
const FOLLOW_ICON = {
  ios: 'person.badge.plus',
  android: 'person_add',
  web: 'person_add',
} as const;

const UNFOLLOW_ICON = {
  ios: 'person.badge.minus',
  android: 'person_remove',
  web: 'person_remove',
} as const;

const SAVE_ICON = {
  ios: 'bookmark',
  android: 'bookmark_border',
  web: 'bookmark_border',
} as const;

const SAVED_ICON = {
  ios: 'bookmark.fill',
  android: 'bookmark',
  web: 'bookmark',
} as const;

/** Outline until liked, filled after — shape carries the state, not just colour. */
const LIKE_ICON = {
  ios: 'heart',
  android: 'favorite_border',
  web: 'favorite_border',
} as const;

const LIKED_ICON = {
  ios: 'heart.fill',
  android: 'favorite',
  web: 'favorite',
} as const;

/**
 * One post, either as a row in the feed or as the subject of its own screen.
 *
 * `wins` is always an array and may be empty, in which case the post is just an
 * author, a caption and a time.
 *
 * The two variants differ only in how much they hold back. A feed row is being
 * scrolled past, so its attachments are capped at two tiles and its comment
 * count is a way in. The detail is what someone opened deliberately: every
 * attachment is shown at full width, and the comment count stops being a link
 * because the comments are already underneath it.
 */
export function PostCard({ post, variant = 'feed' }: { post: Post; variant?: 'feed' | 'detail' }) {
  const detail = variant === 'detail';
  const { author, wins } = post;
  const { user, token } = useAuth();
  const {
    followedIds,
    setFollowed,
    savedPostIds,
    toggleSaved,
    applyLike,
    adjustComments,
    postState,
    composingPostId,
    setComposingPost,
  } = useFeed();
  const showToast = useToast();
  const theme = useTheme();

  /*
   * The box under this card, opened by the comment button. Closed by default:
   * most of the feed is read, not replied to.
   *
   * Which card is open is shared rather than kept per card, so opening one
   * closes any other. The draft stays local, so a half-written reply survives
   * being set aside and is still there on coming back to it.
   */
  const composing = composingPostId === post.id;
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  /*
   * The counters as drawn: what this reader has done to the post, falling back
   * to what the list it came from reported.
   *
   * Read through the override rather than straight off the prop, because the
   * prop only moves for posts in the feed's own list. On a circle's wall the
   * list belongs to that screen, so a like fired the request and then sat
   * there looking as though nothing had happened.
   */
  const interaction = postState[post.id];
  const liked = interaction?.viewer_has_liked ?? post.viewer_has_liked;
  const likes = interaction?.likes_count ?? post.likes_count;
  const comments = interaction?.comments_count ?? post.comments_count;

  const sendComment = async () => {
    const text = draft.trim();
    if (!token || !text || sending) return;

    setSending(true);
    try {
      await createComment(post.id, text, token);
      // The endpoint answers with the comment and says nothing about the total,
      // so the count is ours to move.
      adjustComments(post.id, { to: comments + 1 });
      setDraft('');
      setComposingPost(null);
      showToast('Comment added');
    } catch (caught) {
      // The box stays open holding what was typed — the one thing worse than
      // the failure is having to write it again.
      showToast(caught instanceof Error ? caught.message : 'Could not post that comment.');
    } finally {
      setSending(false);
    }
  };

  const following = followedIds.has(author.id);
  const saved = savedPostIds.has(post.id);
  // Following yourself is a 422, so your own posts simply do not offer it.
  const isMine = user?.id === author.id;

  // Which like request is the current one. Taps are cheap and people change
  // their mind fast, so rather than blocking a second tap until the first lands
  // — which reads as a dropped press — every tap moves the heart immediately
  // and only the newest response is allowed to write back. An older reply
  // arriving late would otherwise undo the newer tap.
  const likeRequest = useRef(0);

  const canSend = draft.trim().length > 0 && !sending;

  const onLike = async () => {
    if (!token) return;

    const next = !liked;
    const ticket = ++likeRequest.current;

    applyLike(post.id, {
      viewer_has_liked: next,
      likes_count: likes + (next ? 1 : -1),
    });

    try {
      const state = await setLikedRemote(post.id, next, token);
      // Idempotent both ways, so this is the count as the server holds it —
      // including other people's likes since the page was fetched.
      if (likeRequest.current === ticket) applyLike(post.id, state);
    } catch (caught) {
      if (likeRequest.current !== ticket) return;
      applyLike(post.id, { likes_count: likes, viewer_has_liked: liked });
      showToast(caught instanceof Error ? caught.message : 'That did not go through.');
    }
  };

  /**
   * How the author is named on a post: the handle, not their full name.
   *
   * Falls back to the full name for an account that has not set a username,
   * since `username` is nullable and a bare "@" would read as a bug.
   *
   * Declared above the menu below, which is built while rendering — a `const`
   * named there before it exists is a crash, not a warning.
   */
  const displayName = author.username ?? author.full_name;

  /** Empty on an openly shared post, and on one the endpoint did not look at. */
  const circles = post.circles ?? [];

  const onFollow = async () => {
    if (!token) return;

    const next = !following;
    // Moved first, then put back if the server disagrees: the menu has already
    // closed, and waiting on a round trip to acknowledge a tap reads as a
    // dropped press.
    setFollowed(author.id, next);
    showToast(next ? `Following ${displayName}` : `Unfollowed ${displayName}`);

    try {
      const state = await setFollowingRemote(author.id, next, token);
      // The server is the authority — it may already have held this state.
      setFollowed(author.id, state.is_following);
    } catch (caught) {
      setFollowed(author.id, !next);
      showToast(caught instanceof Error ? caught.message : 'That did not go through.');
    }
  };

  const items: MenuItem[] = [
    ...(isMine
      ? []
      : [
          {
            label: following ? `Unfollow ${displayName}` : `Follow ${displayName}`,
            icon: following ? UNFOLLOW_ICON : FOLLOW_ICON,
            onPress: () => void onFollow(),
          },
        ]),
    {
      label: saved ? 'Remove from saved' : 'Save post',
      icon: saved ? SAVED_ICON : SAVE_ICON,
      onPress: () => {
        toggleSaved(post.id);
        showToast(saved ? 'Removed from saved' : 'Post saved');
      },
    },
  ];

  // The substance of a learning win is its text, which is too long for a pill.
  const learning = wins.find((win) => win.type === 'learning');
  // Attachments hang off individual wins, but the card shows them as one set —
  // `position` is what orders them, not the win they came from.
  const media = wins.flatMap((win) => win.media).sort((a, b) => a.position - b.position);

  /** Open this post on its own screen, where the whole thread lives. */
  const openPost = () =>
    router.push({ pathname: '/comments/[postId]', params: { postId: post.id } });

  return (
    <View
      // Flush with the screen in the feed as well as on its own page: posts
      // run edge to edge, separated by a hairline rather than floated as
      // rounded cards on a background. A column of cards puts a frame around
      // every photo and leaves the photos smaller for it; the point of the
      // feed is the pictures.
      //
      // `px-4` in both, which is what `MediaStack` cancels with `-mx-4` to run
      // media the full width. The old feed padding of 3.5 was half a step off
      // that, so photos overhung by two points on each side.
      className="border-b border-hairline bg-surface-card px-4 py-3">
      <View className="flex-row items-center gap-3">
        {/* The badge overhangs the avatar, so the two share a box rather than
            the badge being positioned against the whole row. */}
        <View>
          <ImageWithPlaceholder
            source={{ uri: author.avatar_url }}
            className="h-11 w-11 rounded-full"
            accessibilityLabel={`${displayName} profile photo`}>
            <View className="h-11 w-11 items-center justify-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500">
              <Text className="font-heading-bold text-base leading-6 text-white">
                {(author.full_name.trim()[0] ?? '?').toUpperCase()}
              </Text>
            </View>
          </ImageWithPlaceholder>

          {isMine ? null : (
            <FollowBadge
              following={following}
              name={displayName}
              onPress={() => void onFollow()}
            />
          )}
        </View>

        <View className="flex-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${displayName}'s profile`}
            onPress={() =>
              router.push({ pathname: '/users/[userId]', params: { userId: author.id } })
            }
            hitSlop={4}
            className="self-start active:opacity-60">
            <Text numberOfLines={1} className="font-body-semibold text-[15px] leading-5 text-ink">
              {displayName}
            </Text>
          </Pressable>
          {/* The circle sits on the same line as the time rather than under
              it: it is a detail about where the post came from, not a second
              subject, and a line of its own gives it more weight than the
              author's name above.

              It says where the win was placed, not who may read it — circles
              organise, they do not restrict — and it is the way back in. */}
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <Text className="font-sans text-[13px] leading-[18px] text-ink-muted">
              {timeAgo(post.created_at)}
            </Text>

            {circles.length > 0 ? (
              <>
                <Text className="font-sans text-[13px] leading-[18px] text-ink-muted">·</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    circles.length === 1
                      ? `Shared in ${circles[0].name}. Open circle.`
                      : `Shared in ${circles[0].name} and ${circles.length - 1} more. Open circle.`
                  }
                  onPress={() =>
                    router.push({
                      pathname: '/circles/[circleId]',
                      params: { circleId: circles[0].id },
                    })
                  }
                  hitSlop={6}
                  className="shrink flex-row items-center gap-1.5 active:opacity-60">
                  <View
                    className="h-3.5 w-3.5 items-center justify-center rounded-[4px]"
                    style={{ backgroundColor: circles[0].color_hex }}>
                    <Text className="font-heading-bold text-[8px] leading-[11px] text-white">
                      {(circles[0].icon_initial.trim()[0] ?? '?').toUpperCase()}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    className="shrink font-body-semibold text-[13px] leading-[18px] text-ink-muted">
                    {circles[0].name}
                  </Text>
                  {/* Named one and counted the rest: ten chips would bury the
                      author's own name above them. */}
                  {circles.length > 1 ? (
                    <Text className="font-sans text-[13px] leading-[18px] text-ink-muted">
                      +{circles.length - 1}
                    </Text>
                  ) : null}
                </Pressable>
              </>
            ) : null}
          </View>
        </View>

        <MenuButton
          accessibilityLabel={`More options for ${displayName}'s post`}
          items={items}
        />
      </View>

      {/* The substance of the post, and in the feed the way into it. Only this
          much: the header carries the menu and the follow badge, and the row
          below carries like — wrapping those too would make one button out of
          a card full of them. */}
      <PostBody
        onPress={detail ? undefined : openPost}
        label={`Open ${displayName}'s post`}>
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
              <Text
                numberOfLines={1}
                className="font-sans text-[13px] leading-[18px] text-ink-muted">
                {learning.reference_source}
              </Text>
            ) : null}
          </View>
        ) : null}

        {media.length > 0 ? (
          detail ? (
            <MediaStack media={media} />
          ) : (
            <MediaGrid media={media} />
          )
        ) : null}
      </PostBody>

      <View className="mt-3.5 flex-row items-center gap-5">
        <Count
          icon={liked ? LIKED_ICON : LIKE_ICON}
          value={likes}
          label="likes"
          actionLabel={liked ? 'Unlike' : 'Like'}
          tint={liked ? theme.highlight : undefined}
          onPress={() => void onLike()}
        />
        <Count
          icon={{
            ios: 'bubble.right',
            android: 'chat_bubble_outline',
            web: 'chat_bubble_outline',
          }}
          value={comments}
          label="comments"
          // No way in from the detail: the thread is already below it, and the
          // box down there is the one to write in.
          actionLabel={detail ? undefined : composing ? 'Close the comment box' : 'Comment'}
          // Opens a box on the card rather than a screen. Replying to something
          // in passing should not cost the reader their place in the feed.
          onPress={detail ? undefined : () => setComposingPost(composing ? null : post.id)}
        />
      </View>

      {composing && !detail ? (
        <View className="mt-3 flex-row items-end gap-2">
          <TextInput
            autoFocus
            multiline
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a comment…"
            placeholderTextColor={theme.textSecondary}
            maxLength={COMMENT_MAX}
            accessibilityLabel={`Write a comment on ${displayName}'s post`}
            className="max-h-24 flex-1 rounded-2xl border border-hairline bg-surface px-4 py-2.5 font-sans text-[15px] leading-[22px] text-ink"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Post comment"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={() => void sendComment()}
            className={`h-10 w-10 items-center justify-center rounded-full active:opacity-85 ${
              canSend ? '' : 'opacity-40'
            }`}
            style={{ backgroundColor: theme.primary }}>
            {sending ? (
              <ActivityIndicator size="small" color={theme.onPrimary} />
            ) : (
              <SymbolView
                name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
                size={16}
                weight="bold"
                tintColor={theme.onPrimary}
              />
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
