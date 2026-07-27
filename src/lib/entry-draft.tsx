import { createContext, use, useMemo, useState, type ReactNode } from 'react';

/**
 * The in-progress ESC entry, shared across the three pillar screens of the
 * Create flow. Living at the `entry/` layout means it survives navigating
 * between pillars — going back to Meditation after Learning keeps what was
 * typed — and gives the final Share one object to submit.
 *
 * No backend yet: `submit` is where the POST goes once there is an endpoint.
 */
export type MeditationDraft = {
  categoryId: string | null;
  completed: boolean;
  notes: string;
};

export type LearningDraft = {
  title: string;
  /** Optional reference link. */
  link: string;
  reflection: string;
  /** Local photo URIs, uploaded on submit. */
  photos: string[];
};

export type MovementDraft = {
  title: string;
  notes: string;
  photos: string[];
};

export type EntryDraft = {
  meditation: MeditationDraft;
  learning: LearningDraft;
  movement: MovementDraft;
};

const EMPTY: EntryDraft = {
  meditation: { categoryId: null, completed: false, notes: '' },
  learning: { title: '', link: '', reflection: '', photos: [] },
  movement: { title: '', notes: '', photos: [] },
};

type EntryDraftValue = {
  draft: EntryDraft;
  patchMeditation: (patch: Partial<MeditationDraft>) => void;
  patchLearning: (patch: Partial<LearningDraft>) => void;
  patchMovement: (patch: Partial<MovementDraft>) => void;
  /** Hand the finished entry to the backend. A no-op until the endpoint exists. */
  submit: () => Promise<void>;
};

const EntryDraftContext = createContext<EntryDraftValue | null>(null);

export function EntryDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<EntryDraft>(EMPTY);

  const value = useMemo<EntryDraftValue>(
    () => ({
      draft,
      patchMeditation: (patch) =>
        setDraft((d) => ({ ...d, meditation: { ...d.meditation, ...patch } })),
      patchLearning: (patch) => setDraft((d) => ({ ...d, learning: { ...d.learning, ...patch } })),
      patchMovement: (patch) => setDraft((d) => ({ ...d, movement: { ...d.movement, ...patch } })),
      submit: async () => {
        // TODO: POST `draft` to the entries endpoint once it exists, then reset.
      },
    }),
    [draft]
  );

  return <EntryDraftContext.Provider value={value}>{children}</EntryDraftContext.Provider>;
}

export function useEntryDraft() {
  const context = use(EntryDraftContext);
  if (!context) throw new Error('useEntryDraft must be used inside <EntryDraftProvider>');
  return context;
}

/** The three pillars, in flow order — used by the shared progress header. */
export const PILLAR_ORDER = ['meditation', 'learning', 'movement'] as const;
export type Pillar = (typeof PILLAR_ORDER)[number];
