import { apiGet } from '@/lib/api';

/**
 * The three kinds of win, in the order they are drawn round a day's ring.
 *
 * The order is fixed and shared by the ring and its legend: the first dash is
 * always meditation, the second always learning, the third always movement. A
 * ring whose parts moved about would have to be read rather than glanced at.
 */
export const WIN_KINDS = [
  { key: 'meditation', label: 'Meditation', color: '#946FF0' },
  { key: 'learning', label: 'Learning', color: '#E6AC49' },
  { key: 'movement', label: 'Movement', color: '#60BC88' },
] as const;

export type WinKind = (typeof WIN_KINDS)[number]['key'];

/** One day of the week, and which kinds of win landed on it. */
export type ProgressDay = {
  /** `2026-07-29`, the day itself rather than an instant. */
  date: string;
  /** `Mon`, `Tue`, … — shortened by the server so every client agrees. */
  weekday: string;
  day_of_month: number;
  is_today: boolean;
  /**
   * A day still to come. Drawn differently from an empty day already past: one
   * is an opportunity and the other is a miss.
   */
  is_future: boolean;
  meditation: boolean;
  learning: boolean;
  movement: boolean;
};

export type WeekProgress = {
  /** Monday, as `2026-07-27`. */
  start: string;
  /** Sunday. */
  end: string;
  /**
   * The streak still standing, not the stored column — the same number the
   * profile reports, so the badge beside this can never disagree with it.
   */
  streak_days: number;
  longest_streak: number;
  /** Seven entries, Monday first. */
  days: ProgressDay[];
};

/**
 * GET /api/v1/progress/week — this week, a day at a time.
 *
 * Not parameterised: the card only ever shows the week you are in, and a range
 * the client could ask for is a feature nothing has needed yet.
 */
export async function fetchWeekProgress(token: string) {
  const response = await apiGet<{ data: WeekProgress }>('/api/v1/progress/week', token);

  return response.data;
}

/** The pillar names, keyed, so a list of kinds can be read back as words. */
const KIND_LABEL: Record<WinKind, string> = WIN_KINDS.reduce(
  (labels, kind) => ({ ...labels, [kind.key]: kind.label }),
  {} as Record<WinKind, string>
);

/** "Meditation", "Meditation and Learning", "Meditation, Learning and Movement". */
function readAsList(kinds: WinKind[]) {
  const labels = kinds.map((kind) => KIND_LABEL[kind]);
  if (labels.length <= 1) return labels[0] ?? '';

  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * Where today stands across the three pillars, and what to say about it.
 *
 * The wording lives here rather than in the screen because it is one decision
 * with several branches, and it is the branch that is easy to get wrong: an
 * empty `remaining` reads as "all done", which is also what an unknown day looks
 * like. Nothing said about a day nobody has heard from yet.
 */
export type TodayStanding = {
  /** Logged today, in WIN_KINDS order. */
  done: WinKind[];
  /** Still outstanding today, in WIN_KINDS order. */
  remaining: WinKind[];
  /** All three logged. False while the week is unknown, never a guess. */
  complete: boolean;
  /**
   * The sentence about today, or null where there is nothing worth saying —
   * a day not yet started, or one nothing is known about.
   */
  prompt: string | null;
  /** What the button says. Short, because it sits in a pill. */
  action: string;
};

/**
 * Read today out of the week.
 *
 * `is_today` is the server's, not the device's: a phone whose clock or timezone
 * disagrees would otherwise congratulate somebody on the wrong day.
 */
export function standingToday(week: WeekProgress | null | undefined): TodayStanding {
  const today = week?.days.find((day) => day.is_today);

  /*
   * Nothing known: the week has not loaded, or the request failed.
   *
   * The plain invitation is the only honest thing to show. Saying "done" would
   * be a guess that costs somebody their streak, and naming what is left would
   * be a guess about work they may already have done.
   */
  if (!today) {
    return { done: [], remaining: [], complete: false, prompt: null, action: 'Log a win' };
  }

  const done = WIN_KINDS.filter((kind) => today[kind.key]).map((kind) => kind.key);
  const remaining = WIN_KINDS.filter((kind) => !today[kind.key]).map((kind) => kind.key);

  if (remaining.length === 0) {
    return {
      done,
      remaining,
      complete: true,
      prompt: 'All three logged. Come back tomorrow!',
      action: 'Done today',
    };
  }

  // A day not yet started says nothing about what is missing — all three are,
  // and listing them reads as a scolding rather than an invitation.
  if (done.length === 0) {
    return { done, remaining, complete: false, prompt: null, action: 'Log a win' };
  }

  return {
    done,
    remaining,
    complete: false,
    prompt: `You've logged ${readAsList(done)} — add ${readAsList(remaining)}!`,
    // Named singly even where two are left: the button does one thing, and the
    // sentence above it is what carries the whole of what is outstanding.
    action: `Add ${KIND_LABEL[remaining[0]]}`,
  };
}
