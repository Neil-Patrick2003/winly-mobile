import { apiGet } from '@/lib/api';
import type { Circle } from '@/lib/circles';
import type { UserSummary } from '@/lib/stories';

/**
 * Somebody worth following: the person, plus the two numbers that answer
 * "why them".
 */
export type SuggestedPerson = UserSummary & {
  /** How many times they have posted — what the ranking is built on. */
  posts_count: number;
  /** The run still standing, not the stored column. */
  streak_days: number;
};

export type Discover = {
  /** Every tag any circle uses, for the chips. */
  tags: string[];
  /** Biggest first, ten at most. */
  circles: Circle[];
  /** Busiest first, ten at most. Anyone who has posted nothing is left out. */
  people: SuggestedPerson[];
};

/**
 * GET /api/v1/discover — circles to join and people to follow.
 *
 * One request rather than three: the screen shows both lists at once and
 * neither is paginated, so separate calls would only make the page assemble
 * itself in pieces.
 */
export async function fetchDiscover(
  token: string,
  filters: { q?: string; tag?: string } = {}
) {
  const query = new URLSearchParams();

  const term = filters.q?.trim();
  if (term) query.set('q', term);
  if (filters.tag) query.set('tag', filters.tag);

  const suffix = query.toString();
  const response = await apiGet<{ data: Discover }>(
    `/api/v1/discover${suffix ? `?${suffix}` : ''}`,
    token
  );

  return response.data;
}
