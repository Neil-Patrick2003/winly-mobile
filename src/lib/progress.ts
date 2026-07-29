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
