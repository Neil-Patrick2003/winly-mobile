import { apiDelete, apiGet, apiPost } from '@/lib/api';
import type { UserSummary } from '@/lib/stories';

/** Report and block, offered on other people's things. */
export const REPORT_ICON = {
  ios: 'flag',
  android: 'flag',
  web: 'flag',
} as const;

export const BLOCK_ICON = {
  ios: 'nosign',
  android: 'block',
  web: 'block',
} as const;

/** What can be reported, by the name the API uses for it. */
export type ReportType = 'post' | 'comment' | 'story' | 'user';

/** Kept in step with `Report::REASONS` on the server. */
export const REPORT_REASONS = [
  { key: 'spam', label: 'Spam or scam' },
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'hate', label: 'Hate speech' },
  { key: 'sexual', label: 'Nudity or sexual content' },
  { key: 'violence', label: 'Violence or threats' },
  { key: 'self_harm', label: 'Self-harm or suicide' },
  { key: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['key'];

export const REPORT_NOTE_MAX = 1000;

/**
 * POST /api/v1/reports — flag something for the moderators.
 *
 * Hides nothing by itself. Reporting the same thing twice updates the one
 * report rather than filing another.
 */
export function reportContent(
  input: { type: ReportType; id: string; reason: ReportReason; note?: string },
  token: string
) {
  return apiPost<{ data: { id: string } }>(
    '/api/v1/reports',
    { ...input, note: input.note?.trim() || null },
    token
  );
}

/**
 * POST /api/v1/users/{id}/block — hide the two of you from each other.
 *
 * Also removes any follows between you, both ways. They are not told.
 */
export function blockUser(userId: string, token: string) {
  return apiPost<{ data: { user_id: string; is_blocked: true } }>(
    `/api/v1/users/${userId}/block`,
    undefined,
    token
  );
}

/** DELETE /api/v1/users/{id}/block. Does not bring back the follows. */
export function unblockUser(userId: string, token: string) {
  return apiDelete<{ data: { user_id: string; is_blocked: false } }>(
    `/api/v1/users/${userId}/block`,
    token
  );
}

/** GET /api/v1/blocks — everyone you have blocked, most recent first. */
export async function fetchBlockedUsers(token: string) {
  const response = await apiGet<{ data: UserSummary[] }>('/api/v1/blocks', token);
  return response.data;
}
