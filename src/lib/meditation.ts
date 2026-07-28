/**
 * Meditation is logged as a length of time, not a category or a guided track —
 * how long you sat is the whole record.
 *
 * `GET /api/v1/meditation-categories` exists on the backend but nothing in the
 * app consumes it; the flow deliberately does not ask people to classify what
 * they did.
 */

/** The lengths people actually sit for. Anything else rounds to one of these. */
export const MEDITATION_DURATIONS = [5, 10, 15, 20, 30, 45, 60];

/** "20 min", "1 hr", "1.5 hrs" — a duration in minutes, as a label. */
export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours} hr${hours === 1 ? '' : 's'}`;
}

/** "9:05" — seconds remaining, as a countdown face. */
export function formatClock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
