import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PILLAR_THEME } from '@/components/entry-chrome';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { ImageWithPlaceholder } from '@/components/ui/image';
import { MediaPicker } from '@/components/ui/media-picker';
import { TextArea } from '@/components/ui/text-area';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { ACTIVITIES, isMovementAnswered, OTHER_ACTIVITY } from '@/lib/entry-draft';
import { useFeed } from '@/lib/feed-context';
import { formatDuration, MEDITATION_DURATIONS } from '@/lib/meditation';
import { goBack } from '@/lib/navigation';
import {
  fetchPost,
  fromMovementType,
  humanizeMovementType,
  toMovementType,
  updatePost,
  WIN_LABEL,
  type LocalFile,
  type Media,
  type Post,
  type UpdateWin,
  type WinType,
} from '@/lib/posts';
import { useToast } from '@/lib/toast';

/** The three pillars in the order the create flow walks them. */
const PILLARS: WinType[] = ['meditation', 'learning', 'movement'];

/**
 * What each pillar asks for, in the create flow's own words.
 *
 * Repeated here rather than paraphrased: a field that is worded one way when it
 * is written and another way when it is corrected reads as two different
 * questions.
 */
const SUBTITLE: Record<WinType, string> = {
  meditation: 'How long did you meditate?',
  learning: 'Share something you learned today',
  movement: 'What did you do to move your body?',
};

/**
 * One pillar's worth of form state.
 *
 * The fields are the create flow's, not the API's — a chosen duration rather
 * than a typed number, a chip label rather than a `movement_type` — so that
 * editing a win offers exactly the choices that wrote it. `winsFrom` puts them
 * back into what the endpoint takes.
 *
 * `existing` and `removeIds` are kept apart rather than by filtering the list,
 * because the server is told what to drop by id — a photo taken out of view has
 * to still be nameable when the form is submitted.
 */
type PillarForm = {
  /**
   * Whether the post carried this kind when the screen opened.
   *
   * Not what decides it now — `carries` does, from the answer itself. Kept so
   * that clearing a field can say plainly that the win is on its way out,
   * which is the job the switch used to do.
   */
  wasOnPost: boolean;
  existing: Media[];
  removeIds: string[];
  added: LocalFile[];
  /** Meditation: one of `MEDITATION_DURATIONS`, as the chips offer them. */
  minutes: number | null;
  /** False on a sit that was stopped early. Carried through untouched. */
  completed: boolean;
  learned: string;
  reference: string;
  /** Movement: one of the ACTIVITIES labels, or OTHER_ACTIVITY. */
  activity: string | null;
  /** What they actually did, when `activity` is OTHER_ACTIVITY. */
  otherActivity: string;
};

const emptyPillar = (): PillarForm => ({
  wasOnPost: false,
  existing: [],
  removeIds: [],
  added: [],
  minutes: null,
  completed: true,
  learned: '',
  reference: '',
  activity: null,
  otherActivity: '',
});

/**
 * Seed the form from the post as it stands.
 *
 * A pillar the post does not carry is left switched off with empty fields, so
 * turning it on is the same act as adding it in the first place.
 */
function formFor(post: Post): Record<WinType, PillarForm> {
  const form: Record<WinType, PillarForm> = {
    meditation: emptyPillar(),
    learning: emptyPillar(),
    movement: emptyPillar(),
  };

  for (const win of post.wins) {
    const pillar: PillarForm = {
      ...emptyPillar(),
      wasOnPost: true,
      existing: win.media,
    };

    if (win.type === 'meditation') {
      form.meditation = {
        ...pillar,
        minutes: win.duration_minutes,
        completed: win.completed,
      };
    }

    if (win.type === 'learning') {
      form.learning = {
        ...pillar,
        learned: win.learned_text,
        reference: win.reference_source ?? '',
      };
    }

    if (win.type === 'movement') {
      /*
       * Back to the chip that wrote it where there was one, and to "Others"
       * where there was not — a typed activity goes out as itself, so the only
       * honest place to show it again is the box it was typed into.
       */
      const chip = win.movement_type ? fromMovementType(win.movement_type) : null;

      form.movement = {
        ...pillar,
        activity: win.movement_type ? (chip ?? OTHER_ACTIVITY) : null,
        otherActivity:
          chip === null && win.movement_type ? humanizeMovementType(win.movement_type) : '',
      };
    }
  }

  return form;
}

/**
 * Whether the post carries this pillar, going by whether it has been answered.
 *
 * There is no switch to consult: filling a pillar in is what adds it, and
 * clearing it is what takes it away. That is the same bar `buildWins` applies
 * when a post is first written, so a win cannot be edited into a shape the
 * create flow would not have produced — and there is no second control to
 * disagree with the field beside it.
 *
 * Movement counts from the chip alone. Picking "Others" and typing nothing is a
 * pillar being included and left unfinished, which `problemsWith` reports —
 * quietly dropping it would throw away what they had started saying.
 */
function carries(type: WinType, pillar: PillarForm): boolean {
  switch (type) {
    case 'meditation':
      return pillar.minutes !== null;
    case 'learning':
      return pillar.learned.trim().length > 0;
    case 'movement':
      return pillar.activity !== null;
  }
}

/**
 * Turn the form back into what the endpoint takes.
 *
 * Only the pillars still answered are listed, which is how the server is told
 * that the others are gone: `wins` describes the post as it should end up, not
 * what changed about it.
 *
 * Nothing here sends `completed_at`. The create flow has no way to backdate a
 * win either, and a date this screen alone could set would let an edit move a
 * win onto a day the streak has already been counted for.
 */
function winsFrom(form: Record<WinType, PillarForm>): UpdateWin[] {
  const wins: UpdateWin[] = [];

  for (const type of PILLARS) {
    const pillar = form[type];
    if (!carries(type, pillar)) continue;

    const shared = {
      ...(pillar.added.length > 0 ? { media: pillar.added } : {}),
      ...(pillar.removeIds.length > 0 ? { remove_media_ids: pillar.removeIds } : {}),
    };

    // Each of these is guarded by `problemsWith`, which runs first and stops the
    // save — so a pillar that is on but unanswered never reaches here.
    if (type === 'meditation' && pillar.minutes !== null) {
      wins.push({
        ...shared,
        type: 'meditation',
        duration_minutes: pillar.minutes,
        completed: pillar.completed,
      });
    }

    if (type === 'learning') {
      const reference = pillar.reference.trim();
      wins.push({
        ...shared,
        type: 'learning',
        learned_text: pillar.learned.trim(),
        ...(reference ? { reference_source: reference } : {}),
      });
    }

    if (type === 'movement' && pillar.activity !== null) {
      wins.push({
        ...shared,
        type: 'movement',
        movement_type: toMovementType(pillar.activity, pillar.otherActivity),
      });
    }
  }

  return wins;
}

/**
 * Everything wrong with the form, in the order it appears on screen.
 *
 * The same bar each step of the create flow sets before it will let you past,
 * so a win cannot be edited into a state it could never have been written in.
 * Checked here as well as on the server so that the common mistakes answer
 * immediately, and so that "the last win cannot be removed" reads as a sentence
 * rather than as a 422.
 */
function problemsWith(form: Record<WinType, PillarForm>): string[] {
  const problems: string[] = [];
  const on = PILLARS.filter((type) => carries(type, form[type]));

  if (on.length === 0) {
    problems.push('Fill in at least one pillar. To take the whole post down, delete it instead.');
  }

  /*
   * Only movement can be carried and still incomplete. Meditation and learning
   * are carried *because* they have an answer, so there is nothing left to ask
   * about them — but "Others" with an empty box is a half-written activity.
   */
  const movement = form.movement;
  if (
    carries('movement', movement) &&
    !isMovementAnswered(movement.activity, movement.otherActivity)
  ) {
    problems.push(`${WIN_LABEL.movement}: say what you did.`);
  }

  return problems;
}

export default function EditPostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { token, user } = useAuth();
  const { replacePost } = useFeed();
  const showToast = useToast();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const [post, setPost] = useState<Post | null>(null);
  const [form, setForm] = useState<Record<WinType, PillarForm> | null>(null);
  const [caption, setCaption] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token || !postId) return;

    let cancelled = false;

    (async () => {
      try {
        const loaded = await fetchPost(postId, token);
        if (cancelled) return;

        setPost(loaded);
        setForm(formFor(loaded));
        setCaption(loaded.caption ?? '');
      } catch (caught) {
        if (!cancelled) {
          setLoadError(caught instanceof Error ? caught.message : 'That post could not be loaded.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [postId, token]);

  const patch = useCallback((type: WinType, change: Partial<PillarForm>) => {
    setForm((previous) =>
      previous === null ? previous : { ...previous, [type]: { ...previous[type], ...change } },
    );
  }, []);

  const onSave = async () => {
    if (!token || !form || !post || saving) return;

    const problems = problemsWith(form);
    if (problems.length > 0) {
      showToast(problems[0]);
      return;
    }

    setSaving(true);

    try {
      /*
       * Sent even when empty, which is how a caption gets cleared.
       *
       * Leaving the key out means "no opinion" — the server keeps whatever was
       * there — so someone deleting their caption would have watched it come
       * straight back. An empty string reaches Laravel as null, because
       * `ConvertEmptyStringsToNull` is in the global middleware.
       */
      const saved = await updatePost(
        post.id,
        { wins: winsFrom(form), caption: caption.trim() },
        token,
      );

      // Written back before leaving, so the card behind this screen is already
      // showing the edit rather than catching up on the next refresh.
      replacePost(saved);
      showToast('Post updated');
      goBack();
    } catch (caught) {
      setSaving(false);
      showToast(caught instanceof Error ? caught.message : 'That did not go through.');
    }
  };

  const mine = post !== null && user !== null && post.author.id === user.id;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      // Android only; the scroller below handles iOS. The reasoning is set out
      // in full on the sign-up screen, which has the same shape.
      behavior={Platform.OS === 'android' ? 'padding' : undefined}>
      <View
        className="flex-row items-center gap-2 border-b border-hairline bg-surface-card px-4 pb-3"
        style={{ paddingTop: insets.top + 6 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => goBack()}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface active:opacity-60"
        >
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={15}
            tintColor={theme.text}
          />
        </Pressable>

        <Text className="flex-1 font-heading-bold text-[17px] leading-6 text-ink">Edit post</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save changes"
          disabled={saving || form === null}
          onPress={() => void onSave()}
          className="rounded-full bg-primary px-4 py-2 active:opacity-85 disabled:opacity-50"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="font-body-semibold text-[14px] leading-5 text-primary-fg">Save</Text>
          )}
        </Pressable>
      </View>

      {loadError !== null ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center font-sans text-[15px] leading-[22px] text-ink-muted">
            {loadError}
          </Text>
        </View>
      ) : form === null || post === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !mine ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center font-sans text-[15px] leading-[22px] text-ink-muted">
            Only the person who wrote a post can edit it.
          </Text>
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // Insets the content by however much the keyboard covers and scrolls
          // the focused field clear of it. The pillars stack, so the learning
          // box and the "Others" activity sit low on a post carrying all three
          // and are buried without this.
          automaticallyAdjustKeyboardInsets
          contentContainerClassName="w-full max-w-[800px] self-center"
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 32,
            gap: 16,
          }}
        >
          <View className="gap-2 rounded-2xl bg-surface-card p-4">
            <Text className="font-body-semibold text-[13px] leading-[18px] text-ink-muted">
              Caption
            </Text>
            {/* The Review step's own field, down to the limit it enforces — the
                words that went out are edited in the box they were written in. */}
            <TextArea
              placeholder="Say a few words about today… 🌱"
              value={caption}
              onChangeText={setCaption}
              className="min-h-28 rounded-2xl border border-hairline bg-surface px-4 py-3.5 font-sans text-[15px] text-ink"
              maxLength={1000}
            />
          </View>

          {PILLARS.map((type) => (
            <PillarSection
              key={type}
              type={type}
              form={form[type]}
              onChange={(change) => patch(type, change)}
            />
          ))}

          <Text className="px-1 font-sans text-[12px] leading-4 text-ink-muted">
            A pillar you fill in is part of the post; clearing one removes that win, along with its
            photos. At least one has to stay.
          </Text>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

/**
 * One pillar's card, holding the fields the create flow would have collected it
 * with.
 *
 * Always open. There is nothing to expand or switch on, because the fields are
 * the control: answering one adds that win to the post and clearing it takes the
 * win away. A checkbox beside a filled-in field would only be a second, quieter
 * way to say the same thing — and a way for the two to disagree.
 */
function PillarSection({
  type,
  form,
  onChange,
}: {
  type: WinType;
  form: PillarForm;
  onChange: (change: Partial<PillarForm>) => void;
}) {
  const theme = PILLAR_THEME[type];
  const kept = form.existing.filter((media) => !form.removeIds.includes(media.id));

  // Cleared a pillar the post arrived with: on saving, that win goes. Said out
  // loud, because an empty field is otherwise a silent deletion.
  const leaving = form.wasOnPost && !carries(type, form);

  return (
    <View className="gap-3 rounded-2xl bg-surface-card p-4">
      <View className="gap-0.5">
        <Text className="font-heading-bold text-[15px] leading-5 text-ink">{WIN_LABEL[type]}</Text>
        <Text className="font-sans text-[13px] leading-[18px] text-ink-muted">
          {SUBTITLE[type]}
        </Text>
      </View>

      {leaving ? (
        <View className="rounded-xl bg-surface px-3 py-2.5">
          <Text className="font-sans text-[13px] leading-[18px] text-red-500">
            Left empty — this win will be removed from the post when you save
            {kept.length > 0 ? ', along with its photos' : ''}.
          </Text>
        </View>
      ) : null}

      {type === 'meditation' ? (
        <View className="flex-row flex-wrap gap-2.5">
          {MEDITATION_DURATIONS.map((value) => (
            <Chip
              key={value}
              label={formatDuration(value)}
              selected={value === form.minutes}
              accent={theme.accent}
              tint={theme.tint}
              /*
               * Tapping the chosen length again clears it, as on the step
               * that wrote it — a mis-tap should not be permanent, and there
               * is no "none" chip to fall back to. Saving without one is
               * refused rather than guessed at.
               *
               * Choosing a different length is logging that sit, so it also
               * takes back a "stopped early" that no longer describes it.
               * Leaving the length alone leaves that flag alone.
               */
              onPress={() =>
                onChange(
                  value === form.minutes ? { minutes: null } : { minutes: value, completed: true },
                )
              }
            />
          ))}
        </View>
      ) : null}

      {type === 'learning' ? (
        <>
          <TextArea
            placeholder="What did you learn today?"
            value={form.learned}
            onChangeText={(learned) => onChange({ learned })}
            className="min-h-28 rounded-2xl border border-hairline bg-surface px-4 py-3.5 font-sans text-[15px] text-ink"
            maxLength={1000}
          />
          {/* Deliberately not a URL field — "that podcast on the drive home"
                  is as valid a source as a link. */}
          <Field
            placeholder="Reference or source (optional) — book, article, video"
            value={form.reference}
            onChangeText={(reference) => onChange({ reference })}
            maxLength={500}
          />
        </>
      ) : null}

      {type === 'movement' ? (
        <>
          <View className="flex-row flex-wrap gap-2.5">
            {ACTIVITIES.map((item) => (
              <Chip
                key={item.label}
                label={item.label}
                icon={item.icon}
                selected={item.label === form.activity}
                accent={theme.accent}
                tint={theme.tint}
                onPress={() =>
                  onChange({
                    activity: item.label === form.activity ? null : item.label,
                  })
                }
              />
            ))}
          </View>

          {form.activity === OTHER_ACTIVITY ? (
            <TextArea
              placeholder="What did you do?"
              value={form.otherActivity}
              onChangeText={(otherActivity) => onChange({ otherActivity })}
              className="min-h-24 rounded-2xl border border-hairline bg-surface px-4 py-3.5 font-sans text-[15px] text-ink"
              maxLength={200}
            />
          ) : null}
        </>
      ) : null}

      {/* Rendered for any pillar that has some, meditation included: the
              create flow attaches photos to learning and movement alone, but a
              win that arrived carrying them must not be left unable to lose
              them. */}
      {kept.length > 0 ? (
        <View className="gap-1.5">
          <Text className="font-body-semibold text-[13px] leading-[18px] text-ink-muted">
            Photos already on this win
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {kept.map((media) => (
              <View key={media.id}>
                <ImageWithPlaceholder
                  source={{ uri: media.url }}
                  size={72}
                  className="rounded-xl"
                  accessibilityLabel="Attached photo"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove this photo"
                  onPress={() => onChange({ removeIds: [...form.removeIds, media.id] })}
                  hitSlop={6}
                  className="absolute -right-1.5 -top-1.5 h-6 w-6 items-center justify-center rounded-full bg-ink active:opacity-70"
                >
                  <SymbolView
                    name={{ ios: 'xmark', android: 'close', web: 'close' }}
                    size={11}
                    tintColor="#FFFFFF"
                  />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Meditation is a length of time and nothing else, on the step that
              writes it as much as here. */}
      {type === 'learning' ? (
        <MediaPicker
          files={form.added}
          onChange={(added) => onChange({ added })}
          label="Attach a photo (notes, screenshot)"
        />
      ) : null}

      {type === 'movement' ? (
        <MediaPicker
          files={form.added}
          onChange={(added) => onChange({ added })}
          label="Attach a photo of your movement"
        />
      ) : null}
    </View>
  );
}
