import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { PostCard } from '@/components/post-card';
import { ImageWithPlaceholder } from '@/components/ui/image';
import { MenuButton, type MenuItem } from '@/components/ui/menu';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { useFeed } from '@/lib/feed-context';
import {
  createComment,
  deleteComment,
  fetchComments,
  fetchPost,
  updateComment,
  COMMENT_MAX,
  type Comment,
  type Post,
} from '@/lib/posts';
import { timeAgo } from '@/lib/time';
import { useToast } from '@/lib/toast';

/**
 * The given name, for the title. A full display name turns the header into a
 * line of its own and gets truncated anyway; the first word is what people
 * call each other.
 */
function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

const EDIT_ICON = { ios: 'pencil', android: 'edit', web: 'edit' } as const;
const DELETE_ICON = { ios: 'trash', android: 'delete', web: 'delete' } as const;

/**
 * The commenter's photo, falling back to their initial.
 *
 * The size lives on both the image and the stand-in: `ImageWithPlaceholder`
 * hands its `className` to whichever of the two it ends up drawing, and an
 * image given only a radius would lay out at nothing.
 */
function Avatar({ name, uri }: { name: string; uri: string | null }) {
  return (
    <ImageWithPlaceholder
      source={{ uri }}
      className="h-9 w-9 rounded-full"
      accessibilityLabel={`${name} profile photo`}>
      <View className="h-9 w-9 items-center justify-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500">
        <Text className="font-heading-bold text-[13px] leading-[18px] text-white">
          {(name.trim()[0] ?? '?').toUpperCase()}
        </Text>
      </View>
    </ImageWithPlaceholder>
  );
}

/**
 * One comment, which becomes its own editor in place.
 *
 * Editing swaps the text for a box rather than pushing a screen: the thing
 * being changed is two lines long, and losing sight of the conversation around
 * it to change them would cost more than it gives. Saving is disabled until the
 * text has actually moved, so the obvious way out of a mistaken tap is Cancel
 * and there is nothing to undo.
 */
function CommentRow({
  comment,
  canEdit,
  canDelete,
  onSave,
  onDelete,
}: {
  comment: Comment;
  /** Only the person who wrote it — `PATCH /comments/{id}` allows no one else. */
  canEdit: boolean;
  /** Its author, or the author of the post it is on, per `DELETE /comments/{id}`. */
  canDelete: boolean;
  onSave: (text: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const muted = useResolveClassNames('text-ink-muted').color;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);
  const [saving, setSaving] = useState(false);

  const trimmed = draft.trim();
  const canSave = trimmed.length > 0 && trimmed !== comment.text && !saving;
  // The server stamps both on create, so a difference is the only record that
  // the comment was changed after the fact.
  const edited = comment.updated_at !== comment.created_at;

  // Built from what this reader may actually do, so moderating someone else's
  // comment on your own post offers Delete without offering to rewrite it —
  // putting words in their mouth is not what the endpoint permits.
  const items: MenuItem[] = [
    ...(canEdit
      ? [
          {
            label: 'Edit',
            icon: EDIT_ICON,
            onPress: () => {
              setDraft(comment.text);
              setEditing(true);
            },
          },
        ]
      : []),
    ...(canDelete ? [{ label: 'Delete', icon: DELETE_ICON, onPress: onDelete }] : []),
  ];

  return (
    <View className="flex-row gap-3 px-4 py-3">
      <Avatar name={comment.author.full_name} uri={comment.author.avatar_url} />

      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className="font-body-semibold text-[14px] leading-5 text-ink">
            {comment.author.full_name}
          </Text>
          <Text numberOfLines={1} className="flex-1 font-sans text-[12px] leading-4 text-ink-muted">
            {/* `username` is nullable, and a bare "@" would look like a bug. */}
            {comment.author.username ? `@${comment.author.username} · ` : ''}
            {timeAgo(comment.created_at)}
            {edited ? ' · edited' : ''}
          </Text>
          {items.length > 0 && !editing ? (
            <MenuButton accessibilityLabel="Comment options" items={items} />
          ) : null}
        </View>

        {editing ? (
          <View className="gap-2">
            <TextInput
              multiline
              autoFocus
              value={draft}
              onChangeText={setDraft}
              placeholderTextColor={muted}
              maxLength={COMMENT_MAX}
              accessibilityLabel="Edit comment"
              className="rounded-2xl border border-hairline bg-surface-card px-3.5 py-2.5 font-sans text-[15px] leading-[22px] text-ink"
            />
            <View className="flex-row items-center gap-4">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSave }}
                disabled={!canSave}
                onPress={async () => {
                  setSaving(true);
                  // Left open on failure, so the words are still there to retry
                  // with rather than lost to a closed editor.
                  if (await onSave(trimmed)) setEditing(false);
                  setSaving(false);
                }}
                hitSlop={6}
                className={`active:opacity-60 ${canSave ? '' : 'opacity-40'}`}>
                <Text
                  className="font-body-semibold text-[13px] leading-[18px]"
                  style={{ color: theme.primary }}>
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => setEditing(false)}
                hitSlop={6}
                className="active:opacity-60">
                <Text className="font-body-semibold text-[13px] leading-[18px] text-ink-muted">
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text className="font-sans text-[15px] leading-[22px] text-ink">{comment.text}</Text>
        )}
      </View>
    </View>
  );
}

/**
 * The conversation under one post.
 *
 * Comments are held here rather than in the feed store: the feed keeps what
 * every card needs to draw itself, and a thread is only ever wanted by the
 * screen showing it. What does cross back is the total — `adjustComments` keeps
 * the card's counter honest while this screen is open over it.
 */
export default function CommentsScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const theme = useTheme();
  const muted = useResolveClassNames('text-ink-muted').color;
  const { user, token } = useAuth();
  const { posts, adjustComments } = useFeed();
  const showToast = useToast();

  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  // Refs for the same reason the feed uses them: they are read inside the
  // fetch, and as state they would either stale-close over an old value or
  // force `load` to be rebuilt on every page.
  const cursor = useRef<string | null>(null);
  const atEnd = useRef(false);
  const inFlight = useRef(false);

  // The feed's copy is preferred over a fetched one: it is the row being kept
  // up to date, so a like or a follow made here is already reflected in it.
  const fromFeed = posts.find((item) => item.id === postId);
  // Only for a thread whose post the feed is not holding — opened from a
  // notification, or one that has fallen off the pages loaded so far.
  const [fetchedPost, setFetchedPost] = useState<Post | null>(null);
  const post = fromFeed ?? fetchedPost;
  // Counting what is on screen would understate a thread longer than a page,
  // so it is the last resort rather than the first.
  const total = post?.comments_count ?? comments.length;

  /**
   * Newest at the top, oldest at the bottom — the latest thing said is the
   * first thing read.
   *
   * The same order the server pages in, which is what lets scrolling down load
   * more: page one is the most recent comments, and each further page is older
   * and belongs below what is already there. Sorting here rather than trusting
   * arrival order is what puts a comment written just now at the top without a
   * refetch.
   */
  const ordered = useMemo(
    () =>
      [...comments].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [comments]
  );

  const load = useCallback(
    async (reset: boolean) => {
      if (!token || !postId || inFlight.current) return;
      if (!reset && atEnd.current) return;

      inFlight.current = true;
      setError(null);

      try {
        const page = await fetchComments(
          postId,
          token,
          reset ? undefined : (cursor.current ?? undefined)
        );
        cursor.current = page.meta.next_cursor;
        atEnd.current = page.meta.next_cursor === null;
        setComments((previous) => {
          if (reset) return page.data;
          // Guarded against a comment arriving on two pages, which cursor
          // pagination allows when the thread grows underneath the reader.
          const seen = new Set(previous.map((item) => item.id));
          return [...previous, ...page.data.filter((item) => !seen.has(item.id))];
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not load the comments.');
      } finally {
        inFlight.current = false;
      }
    },
    [token, postId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load(true);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Only when the feed cannot answer. Deliberately silent on failure: the
  // thread is the point of the screen and has its own error path, so a post
  // that will not load costs the reader its header and nothing more.
  const missingFromFeed = !fromFeed;

  useEffect(() => {
    if (!token || !postId || !missingFromFeed) return;

    let cancelled = false;
    (async () => {
      try {
        const fetched = await fetchPost(postId, token);
        if (!cancelled) setFetchedPost(fetched);
      } catch {
        // Leaves the screen as a bare thread.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, postId, missingFromFeed]);

  const refresh = async () => {
    atEnd.current = false;
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (atEnd.current || inFlight.current) return;
    setLoadingMore(true);
    await load(false);
    setLoadingMore(false);
  };

  const send = async () => {
    const text = draft.trim();
    if (!token || !postId || !text || sending) return;

    setSending(true);
    try {
      const created = await createComment(postId, text, token);
      // Straight to the front, which is where the sort keeps it.
      setComments((previous) => [created, ...previous]);
      // The endpoint answers with the comment and says nothing about the total,
      // so the count is ours to move.
      adjustComments(postId, { by: 1 });
      setDraft('');
    } catch (caught) {
      // The box is left as it was — retyping a comment because the network
      // blinked is the one thing worse than the failure.
      showToast(caught instanceof Error ? caught.message : 'Could not post that comment.');
    } finally {
      setSending(false);
    }
  };

  const save = async (comment: Comment, text: string) => {
    if (!token) return false;

    try {
      const updated = await updateComment(comment.id, text, token);
      setComments((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
      return true;
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'Could not save that edit.');
      return false;
    }
  };

  const confirmDelete = (comment: Comment) => {
    // Removing someone else's words off your own post is a different act from
    // deleting your own, so the prompt says whose it is rather than leaving the
    // reader to check the row behind the dialog.
    const theirs = comment.author.id !== user?.id;

    Alert.alert(
      theirs ? `Delete ${comment.author.full_name}'s comment?` : 'Delete comment?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;

            // Gone from the list first: the confirmation has already been
            // given, and a row that lingers while the request runs reads as a
            // failure.
            const previous = comments;
            setComments((current) => current.filter((item) => item.id !== comment.id));

            try {
              const result = await deleteComment(comment.id, token);
              // Unlike creating, this one does hand back the new total.
              adjustComments(result.post_id, { to: result.comments_count });
            } catch (caught) {
              setComments(previous);
              showToast(
                caught instanceof Error ? caught.message : 'Could not delete that comment.'
              );
            }
          },
        },
      ]
    );
  };

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      // No offset: `headerShown` is false for this route, so the view already
      // starts at the top of the window and there is no chrome to account for.
      //
      // `padding` on Android too, rather than leaving it to the system. Under
      // edge-to-edge — on by default since SDK 54 — the window no longer
      // resizes when the keyboard opens, so without this the box being typed
      // in sits underneath it.
      behavior="padding">
      <View
        className="flex-row items-center gap-2 px-4 pb-2"
        style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          hitSlop={8}
          className="-ml-2 p-2 active:opacity-60">
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={18}
            tintColor={theme.text}
          />
        </Pressable>
        {/* Named for whose post it is once that is known — "Comments" says
            nothing you cannot already see, and the post may not have loaded. */}
        <Text numberOfLines={1} className="flex-1 font-heading-bold text-xl leading-7 text-ink">
          {post ? `${firstName(post.author.full_name)}'s post` : 'Comments'}
        </Text>
        {total > 0 ? (
          <Text className="font-sans text-[15px] leading-5 text-ink-muted">{total}</Text>
        ) : null}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={theme.textSecondary} />
        </View>
      ) : (
        <FlatList
          data={ordered}
          keyExtractor={(comment) => comment.id}
          renderItem={({ item }) => (
            <CommentRow
              comment={item}
              canEdit={user?.id === item.author.id}
              // The post's author moderates their own thread. `post` is
              // undefined only when it could not be loaded at all, which
              // quietly falls back to the stricter author-only rule.
              canDelete={user?.id === item.author.id || user?.id === post?.author.id}
              onSave={(text) => save(item, text)}
              onDelete={() => confirmDelete(item)}
            />
          )}
          contentContainerClassName="w-full max-w-[800px] self-center"
          contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // The oldest comments are at the bottom, so reaching it is the ask
          // for more — the same direction the server pages in.
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
          }
          // The post rides as the list header rather than sitting above the
          // list: it scrolls away as the thread is read, which is what leaves
          // the whole screen to the comments once someone is into them.
          ListHeaderComponent={post ? <PostCard post={post} variant="detail" /> : null}
          ListEmptyComponent={
            <View className="items-center px-10 py-8">
              <Text className="text-center font-sans text-sm leading-5 text-ink-muted">
                {error ?? 'No comments yet. Be the first to say something kind.'}
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View className="py-4">
                <ActivityIndicator size="small" color={theme.textSecondary} />
              </View>
            ) : null
          }
        />
      )}

      <View
        className="flex-row items-end gap-2 border-t border-hairline bg-surface-card px-4 pt-3"
        // The inset clears the home indicator, but the keyboard already covers
        // that — keeping it would leave the bar floating above a strip of
        // nothing.
        style={{ paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 12 }}>
        <TextInput
          multiline
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a comment…"
          placeholderTextColor={muted}
          maxLength={COMMENT_MAX}
          accessibilityLabel="Write a comment"
          className="max-h-28 flex-1 rounded-2xl border border-hairline bg-surface px-4 py-2.5 font-sans text-[15px] leading-[22px] text-ink"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Post comment"
          accessibilityState={{ disabled: !canSend, busy: sending }}
          disabled={!canSend}
          onPress={() => void send()}
          className={`h-11 w-11 items-center justify-center rounded-full active:opacity-85 ${
            canSend ? '' : 'opacity-40'
          }`}
          style={{ backgroundColor: theme.primary }}>
          {sending ? (
            <ActivityIndicator size="small" color={theme.onPrimary} />
          ) : (
            <SymbolView
              name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
              size={17}
              weight="bold"
              tintColor={theme.onPrimary}
            />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
