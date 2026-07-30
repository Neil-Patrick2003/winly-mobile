import { apiDelete, apiGet, apiPost } from '@/lib/api';
import type { Page } from '@/lib/posts';
import type { UserSummary } from '@/lib/stories';

/**
 * The kinds the server raises. `mention` and `streak` are declared by the
 * model but nothing writes them yet.
 */
export type NotificationType = 'follow' | 'like' | 'comment' | 'mention' | 'streak' | 'circle';

export type AppNotification = {
  id: string;
  type: NotificationType;
  /** Written server-side, so every client says the same thing. */
  message: string;
  is_read: boolean;
  created_at: string;
  /** Who caused it. Absent where the endpoint did not look. */
  actor?: UserSummary;
  /**
   * What it happened to, or null for a follow — which is also what decides
   * where a tap lands: a post, or the actor's profile.
   */
  post_id: string | null;
};

const PER_PAGE = 20;

/** GET /api/v1/notifications — newest first, read and unread alike. */
export function fetchNotifications(token: string, cursor?: string, perPage = PER_PAGE) {
  const query = new URLSearchParams({ per_page: String(perPage) });
  if (cursor) query.set('cursor', cursor);

  return apiGet<Page<AppNotification>>(`/api/v1/notifications?${query.toString()}`, token);
}

/**
 * GET /api/v1/notifications/unread-count — what the bell wears.
 *
 * Its own endpoint because it is asked far more often than the list is read,
 * and a count is a great deal cheaper than a page of rows.
 */
export async function fetchUnreadCount(token: string) {
  const response = await apiGet<{ data: { unread: number } }>(
    '/api/v1/notifications/unread-count',
    token
  );

  return response.data.unread;
}

/** POST /api/v1/notifications/read — everything, at the moment the list opens. */
export async function markNotificationsRead(token: string) {
  const response = await apiPost<{ data: { unread: number } }>(
    '/api/v1/notifications/read',
    undefined,
    token
  );

  return response.data.unread;
}

/** DELETE /api/v1/notifications/{id} — only your own; anyone else's is a 404. */
export async function deleteNotification(id: string, token: string) {
  const response = await apiDelete<{ data: { id: string } }>(
    `/api/v1/notifications/${id}`,
    token
  );

  return response.data;
}
