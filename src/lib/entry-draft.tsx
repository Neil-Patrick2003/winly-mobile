import { useGlobalSearchParams } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/lib/auth-context';
import { fetchCircles } from '@/lib/circles';
import { formatBytes, MAX_POST_BYTES, totalUploadBytes } from '@/lib/media';
import {
  createPost,
  toMovementType,
  type LocalFile,
  type NewWin,
  type Post,
  type PostVisibility,
} from '@/lib/posts';

/**
 * The in-progress small win, shared across the flow's step screens. Living at
 * the `entry/` layout means it survives navigating between steps — going back
 * to Meditation after Learning keeps what was typed — and gives Review one
 * object to submit.
 *
 * Every pillar carries its own `completed` flag rather than inferring it from
 * whether the fields are filled in: "I meditated but would rather not say what"
 * is a win too, and the Skip control depends on the difference.
 *
 * No backend yet: `submit` is where the POST goes once there is an endpoint.
 */
export type MeditationDraft = {
  /** How long they sat, in whole minutes. */
  minutes: number | null;
  /**
   * The sit happened. Derived rather than declared: choosing a length says so,
   * and clearing it takes that back.
   *
   * There is no longer a way for this to be false with a length still chosen —
   * the in-app countdown was what used to produce "stopped early", and the step
   * now only logs sittings that have already happened. The field stays because
   * the API still carries it, and a client that stopped sending it would be
   * quietly deciding the question for every win.
   */
  completed: boolean;
};

export type LearningDraft = {
  learned: string;
  /** Free text, not a URL — "that podcast on the drive home" counts. */
  reference: string;
  /** Picked from the library, uploaded with the post. */
  photos: LocalFile[];
  completed: boolean;
};

/**
 * The `activity` value standing for "none of the chips". Kept beside the list
 * itself because Review has to recognise it too, and read the free-text field
 * instead of showing the sentinel.
 */
export const OTHER_ACTIVITY = 'Others';

/**
 * The shortlist, not an exhaustive taxonomy — "Others" opens a box for whatever
 * is missing. Labels are the stored value, so renaming one orphans the drafts
 * that chose it.
 *
 * Lives here rather than on the Movement step because editing a post offers the
 * same choice, and two lists of chips would drift into disagreeing about what a
 * movement win may be.
 */
export const ACTIVITIES: { label: string; icon: SymbolViewProps['name'] }[] = [
  { label: 'Morning Walk', icon: { ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' } },
  { label: 'Run', icon: { ios: 'figure.run', android: 'directions_run', web: 'directions_run' } },
  { label: 'Yoga', icon: { ios: 'figure.yoga', android: 'self_improvement', web: 'self_improvement' } },
  { label: 'Gym', icon: { ios: 'dumbbell', android: 'fitness_center', web: 'fitness_center' } },
  { label: 'Stretching', icon: { ios: 'figure.flexibility', android: 'accessibility_new', web: 'accessibility_new' } },
  { label: 'Cycling', icon: { ios: 'bicycle', android: 'directions_bike', web: 'directions_bike' } },
  { label: OTHER_ACTIVITY, icon: { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' } },
];

/**
 * Whether a movement answer stands up: a chip, and — since "Others" is not an
 * answer on its own — the words that go with it.
 *
 * Shared with the edit screen, which holds a movement win to the same bar the
 * step that wrote it did.
 */
export function isMovementAnswered(activity: string | null, otherActivity: string) {
  return activity !== null && (activity !== OTHER_ACTIVITY || otherActivity.trim().length > 0);
}

export type MovementDraft = {
  /** One of the ACTIVITIES labels on the Movement step, or OTHER_ACTIVITY. */
  activity: string | null;
  /** What they actually did, when `activity` is OTHER_ACTIVITY. */
  otherActivity: string;
  photos: LocalFile[];
  completed: boolean;
};

export type EntryDraft = {
  meditation: MeditationDraft;
  learning: LearningDraft;
  movement: MovementDraft;
  /** The words that go out with the post, written on the Review step. */
  caption: string;
};

const EMPTY: EntryDraft = {
  meditation: { minutes: null, completed: false },
  learning: { learned: '', reference: '', photos: [], completed: false },
  movement: { activity: null, otherActivity: '', photos: [], completed: false },
  caption: '',
};

/**
 * The wins a finished draft turns into, in the order the API returns them.
 *
 * The bar for inclusion is this app's, not the API's: a movement win is valid
 * with nothing but its type, but the Movement step requires an activity before
 * it will let you past, so an empty one never reaches here.
 *
 * Photos ride along on the win they were attached to; `createPost` switches to
 * multipart when any are present. A pillar carrying *only* photos is still left
 * out, because its own required field is what makes it a win.
 */
export function buildWins(draft: EntryDraft): NewWin[] {
  const { meditation, learning, movement } = draft;
  const wins: NewWin[] = [];

  if (meditation.minutes !== null) {
    wins.push({
      type: 'meditation',
      duration_minutes: meditation.minutes,
      completed: meditation.completed,
    });
  }

  if (learning.learned.trim()) {
    const reference = learning.reference.trim();
    wins.push({
      type: 'learning',
      learned_text: learning.learned.trim(),
      ...(reference ? { reference_source: reference } : {}),
      ...(learning.photos.length > 0 ? { media: learning.photos } : {}),
    });
  }

  if (movement.activity) {
    wins.push({
      type: 'movement',
      movement_type: toMovementType(movement.activity, movement.otherActivity),
      ...(movement.photos.length > 0 ? { media: movement.photos } : {}),
    });
  }

  return wins;
}

/**
 * The words that go out with the post.
 *
 * Just the caption. A typed "Others" activity used to be pinned to the front of
 * it, because `movement_type` was taken to be a closed enum that would swallow
 * it — it is free text, so it now goes out as the movement type itself and has
 * no business rewriting what someone wrote.
 */
export function buildCaption(draft: EntryDraft) {
  return draft.caption.trim();
}

type EntryDraftValue = {
  draft: EntryDraft;
  patchMeditation: (patch: Partial<MeditationDraft>) => void;
  patchLearning: (patch: Partial<LearningDraft>) => void;
  patchMovement: (patch: Partial<MovementDraft>) => void;
  setCaption: (caption: string) => void;
  /**
   * Create the post, clear the draft, and hand back what the server stored so
   * the caller can put it straight into the feed. Throws so Review can report.
   */
  submit: () => Promise<Post>;
  /**
   * Every circle the author could share into.
   *
   * Opened from a circle, that is the one circle and the only one. Opened from
   * anywhere else it is all of them, and `visibility` decides which are used.
   */
  targets: { id: string; name: string }[];
  /**
   * True when the flow was opened from a particular circle, which pins the win
   * to it. There is no audience to choose in that case — the choice was made
   * by opening the flow where it was opened.
   */
  lockedToCircle: boolean;
  /** Who the win is for. */
  visibility: PostVisibility;
  setVisibility: (visibility: PostVisibility) => void;
  /**
   * The circles picked by hand, meaningful only under `custom`.
   *
   * Kept while the author moves between options so that flicking to Public and
   * back does not throw away a selection they made a moment ago.
   */
  chosenCircleIds: string[];
  toggleCircle: (id: string) => void;
};

/** The server caps `circle_ids` at 50; one page of circles is plenty under it. */
const MAX_CIRCLE_TARGETS = 50;

const EntryDraftContext = createContext<EntryDraftValue | null>(null);

export function EntryDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<EntryDraft>(EMPTY);
  const { token } = useAuth();

  /*
   * Captured once, on the first render of the flow.
   *
   * The circle arrives as a query parameter on `/entry`, and the steps that
   * follow have URLs of their own that carry nothing — so reading the
   * parameter on every render would lose the circle the moment somebody
   * tapped through to Meditation. The initialiser form freezes it for the life
   * of the flow, which is exactly as long as the draft lives.
   */
  const params = useGlobalSearchParams<{ circleId?: string; circleName?: string }>();
  const [opened] = useState(() =>
    params.circleId ? { id: params.circleId, name: params.circleName ?? 'this circle' } : null
  );

  const lockedToCircle = opened !== null;
  const [mine, setMine] = useState<{ id: string; name: string }[]>([]);

  /*
   * Every circle the author is in, for the unlocked case.
   *
   * Fetched rather than assumed: the win goes to all of them, so the list has
   * to be the real one at the moment of sharing. A failure leaves it empty,
   * which shares openly — the safe way to be wrong.
   */
  useEffect(() => {
    if (!token || lockedToCircle) return;

    let cancelled = false;
    (async () => {
      try {
        const page = await fetchCircles(token, undefined, MAX_CIRCLE_TARGETS);
        if (!cancelled) setMine(page.data.map((circle) => ({ id: circle.id, name: circle.name })));
      } catch {
        // Left empty on purpose; see above.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, lockedToCircle]);

  const targets = useMemo(() => (opened ? [opened] : mine), [opened, mine]);

  /*
   * Circles by default, not public.
   *
   * Sharing wider than intended cannot be taken back once it has been read,
   * and sharing narrower can be fixed by sharing again — so where the two
   * defaults disagree, the quiet one wins. Opened from a circle, the audience
   * is that circle and the picker does not appear at all.
   */
  const [visibility, setVisibility] = useState<PostVisibility>('all_circles');
  const [chosenCircleIds, setChosenCircleIds] = useState<string[]>([]);

  const toggleCircle = useCallback((id: string) => {
    setChosenCircleIds((chosen) =>
      chosen.includes(id) ? chosen.filter((each) => each !== id) : [...chosen, id]
    );
  }, []);

  const value = useMemo<EntryDraftValue>(
    () => ({
      draft,
      targets,
      lockedToCircle,
      visibility,
      setVisibility,
      chosenCircleIds,
      toggleCircle,
      patchMeditation: (patch) =>
        setDraft((d) => ({ ...d, meditation: { ...d.meditation, ...patch } })),
      patchLearning: (patch) => setDraft((d) => ({ ...d, learning: { ...d.learning, ...patch } })),
      patchMovement: (patch) => setDraft((d) => ({ ...d, movement: { ...d.movement, ...patch } })),
      setCaption: (caption) => setDraft((d) => ({ ...d, caption })),
      submit: async () => {
        if (!token) throw new Error('You need to be signed in to share a win.');

        const wins = buildWins(draft);
        if (wins.length === 0) throw new Error('Add something to share first.');

        /*
         * The per-photo cap is the picker's, applied one pillar at a time, so
         * until here nothing has looked at what the pillars come to together.
         * Ten photos that each passed can still make a request the server will
         * refuse — and it refuses it by hanging up while the body is still
         * going out, which reaches the client as an unreadable write failure
         * rather than as the 413 it really is. Caught here, it can at least be
         * described accurately and while the photos are still removable.
         */
        const attachments = wins.flatMap((win) => win.media ?? []);
        if (totalUploadBytes(attachments) > MAX_POST_BYTES) {
          throw new Error(
            `These photos come to more than ${formatBytes(MAX_POST_BYTES)} together, which is ` +
              'more than one post can carry. Remove a couple and share the rest.'
          );
        }

        const caption = buildCaption(draft);

        /*
         * One request carrying every win, so the three pillars land as a single
         * moment in the feed and cannot half-succeed.
         *
         * Opened from a circle, the win goes to that circle and no other: the
         * audience was chosen by where the flow was opened, and offering a
         * picker afterwards would be asking a question already answered.
         *
         * `circle_ids` goes only with `custom`. The server refuses a list
         * alongside the other two rather than ignoring it, which is what keeps
         * this honest — a mismatch here is a 422, not a win quietly landing
         * somewhere nobody meant.
         */
        const sharing: PostVisibility = lockedToCircle ? 'custom' : visibility;
        const circleIds = lockedToCircle ? targets.map((circle) => circle.id) : chosenCircleIds;

        const post = await createPost(
          {
            wins,
            visibility: sharing,
            ...(caption ? { caption } : {}),
            ...(sharing === 'custom' ? { circle_ids: circleIds } : {}),
          },
          token
        );

        setDraft(EMPTY);
        return post;
      },
    }),
    [draft, token, targets, lockedToCircle, visibility, chosenCircleIds, toggleCircle]
  );

  return <EntryDraftContext.Provider value={value}>{children}</EntryDraftContext.Provider>;
}

export function useEntryDraft() {
  const context = use(EntryDraftContext);
  if (!context) throw new Error('useEntryDraft must be used inside <EntryDraftProvider>');
  return context;
}

/** The three pillars, in flow order — used by the shared step indicator. */
export const PILLAR_ORDER = ['meditation', 'learning', 'movement'] as const;
export type Pillar = (typeof PILLAR_ORDER)[number];
