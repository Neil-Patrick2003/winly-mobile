import { useGlobalSearchParams } from 'expo-router';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth-context';
import { fetchCircles } from '@/lib/circles';
import { createPost, toMovementType, type LocalFile, type NewWin, type Post } from '@/lib/posts';

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
  /** They ran the in-app countdown rather than just logging a length. */
  usedTimer: boolean;
  /**
   * The full sit happened. Derived rather than declared: choosing a length says
   * so, and opening the timer takes it back until the countdown reaches zero.
   * False on a shared win is what reads as "stopped early".
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
 * The `activity` value standing for "none of the chips". Kept here rather than
 * with the chip list because Review has to recognise it too, and read the
 * free-text field instead of showing the sentinel.
 */
export const OTHER_ACTIVITY = 'Others';

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
  meditation: { minutes: null, usedTimer: false, completed: false },
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
   * The circles this win is bound for.
   *
   * Opened from a circle, that is the one circle. Opened from anywhere else it
   * is every circle you are in — one post reaching all of them, rather than a
   * copy per circle. Empty means the open feed only.
   */
  targets: { id: string; name: string }[];
  /**
   * True when the flow was opened from a particular circle, which is the only
   * thing that narrows where the win goes. Review says which either way.
   */
  lockedToCircle: boolean;
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

  const value = useMemo<EntryDraftValue>(
    () => ({
      draft,
      targets,
      lockedToCircle,
      patchMeditation: (patch) =>
        setDraft((d) => ({ ...d, meditation: { ...d.meditation, ...patch } })),
      patchLearning: (patch) => setDraft((d) => ({ ...d, learning: { ...d.learning, ...patch } })),
      patchMovement: (patch) => setDraft((d) => ({ ...d, movement: { ...d.movement, ...patch } })),
      setCaption: (caption) => setDraft((d) => ({ ...d, caption })),
      submit: async () => {
        if (!token) throw new Error('You need to be signed in to share a win.');

        const wins = buildWins(draft);
        if (wins.length === 0) throw new Error('Add something to share first.');

        const caption = buildCaption(draft);
        // One request carrying every win, so the three pillars land as a single
        // moment in the feed and cannot half-succeed.
        /*
         * Every circle it is bound for, in one request: the win is one post
         * reaching all of them rather than a copy sitting in each. There is no
         * choice to make here — a win is public and goes to your circles, and
         * a switch offering otherwise was a decision nobody wanted to take.
         */
        const circleIds = targets.map((circle) => circle.id);

        const post = await createPost(
          {
            wins,
            ...(caption ? { caption } : {}),
            ...(circleIds.length > 0 ? { circle_ids: circleIds } : {}),
          },
          token
        );

        setDraft(EMPTY);
        return post;
      },
    }),
    [draft, token, targets, lockedToCircle]
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
