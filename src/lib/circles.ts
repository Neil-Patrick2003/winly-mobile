import { apiDelete, apiGet, apiPost } from '@/lib/api';
import type { Page, Post } from '@/lib/posts';
import type { UserSummary } from '@/lib/stories';

/**
 * A circle: a named group people join.
 *
 * Was "community" until the app settled on the word — the shape is unchanged,
 * and so is the table underneath it.
 */
export type Circle = {
  id: string;
  name: string;
  description: string | null;
  /** One letter, derived from the name server-side. */
  icon_initial: string;
  /** `#946FF0` — picked from the name, so it never appears to change. */
  color_hex: string;
  tag: string | null;
  is_private: boolean;
  members_count: number;
  /**
   * How much has been shared into it. Absent where the endpoint did not count
   * — creating a circle answers before there is anything to count.
   */
  posts_count?: number;
  /** Whether the reader made it. */
  is_owner: boolean;
  /**
   * Whether the reader is in it. Absent where the endpoint did not look —
   * absent is not the same as false, and a screen that assumed otherwise would
   * offer "Join" for a circle you are already in.
   */
  is_member?: boolean;
  owner?: UserSummary;
  created_at: string;
};

/** Somebody in a circle, and when they joined. */
export type CircleMember = UserSummary & {
  joined_at: string;
  /** Whether this member made the circle. Absent where it was not asked for. */
  is_owner?: boolean;
};

/** The circle endpoints' own default; 50 is the ceiling. */
const CIRCLES_PER_PAGE = 20;

/**
 * GET /api/v1/circles — the circles you made and the ones you joined.
 *
 * One list rather than two: the screen shows them together, and `is_owner` is
 * the only thing that separates them.
 */
export function fetchCircles(token: string, cursor?: string, perPage = CIRCLES_PER_PAGE) {
  const query = new URLSearchParams({ per_page: String(perPage) });
  if (cursor) query.set('cursor', cursor);

  return apiGet<Page<Circle>>(`/api/v1/circles?${query.toString()}`, token);
}

/**
 * POST /api/v1/circles — start one.
 *
 * Public only for now. The server refuses a private one outright rather than
 * quietly making it public, so a client is never told it made something it did
 * not.
 */
export async function createCircle(
  fields: { name: string; description?: string; tag?: string },
  token: string
) {
  const body: Record<string, string> = { name: fields.name.trim() };

  const description = fields.description?.trim();
  if (description) body.description = description;

  const tag = fields.tag?.trim();
  if (tag) body.tag = tag;

  const response = await apiPost<{ data: Circle }>('/api/v1/circles', body, token);

  return response.data;
}

/** GET /api/v1/circles/{id} — one on its own. */
export async function fetchCircle(circleId: string, token: string) {
  const response = await apiGet<{ data: Circle }>(`/api/v1/circles/${circleId}`, token);

  return response.data;
}

/** GET /api/v1/circles/{id}/members — who is in it, most recently joined first. */
export function fetchCircleMembers(
  circleId: string,
  token: string,
  cursor?: string,
  perPage = CIRCLES_PER_PAGE
) {
  const query = new URLSearchParams({ per_page: String(perPage) });
  if (cursor) query.set('cursor', cursor);

  return apiGet<Page<CircleMember>>(
    `/api/v1/circles/${circleId}/members?${query.toString()}`,
    token
  );
}

/** What join and leave both answer with. */
type MembershipState = { id: string; is_member: boolean; members_count: number };

/** POST /api/v1/circles/{id}/membership — join. Joining twice counts once. */
export async function joinCircle(circleId: string, token: string) {
  const response = await apiPost<{ data: MembershipState }>(
    `/api/v1/circles/${circleId}/membership`,
    undefined,
    token
  );

  return response.data;
}

/** DELETE /api/v1/circles/{id}/membership — leave. */
export async function leaveCircle(circleId: string, token: string) {
  const response = await apiDelete<{ data: MembershipState }>(
    `/api/v1/circles/${circleId}/membership`,
    token
  );

  return response.data;
}

/** DELETE /api/v1/circles/{id} — only the owner may; anyone else gets a 403. */
export async function deleteCircle(circleId: string, token: string) {
  const response = await apiDelete<{ data: { id: string } }>(
    `/api/v1/circles/${circleId}`,
    token
  );

  return response.data;
}

/** GET /api/v1/circles/{id}/posts — the wins shared into it, newest first. */
export function fetchCirclePosts(
  circleId: string,
  token: string,
  cursor?: string,
  perPage = CIRCLES_PER_PAGE
) {
  const query = new URLSearchParams({ per_page: String(perPage) });
  if (cursor) query.set('cursor', cursor);

  return apiGet<Page<Post>>(`/api/v1/circles/${circleId}/posts?${query.toString()}`, token);
}

/** Where somebody stands with a circle they have been offered. */
export type InviteStatus = 'pending' | 'accepted' | 'declined';

/**
 * A friend, as the invite screen needs them.
 *
 * "Friend" is a follow that goes both ways. Everyone comes back, including
 * those already in and those already asked — a list that quietly dropped them
 * would look like the invitation had not been sent.
 */
export type InvitableFriend = UserSummary & {
  is_member?: boolean;
  /** Null where this circle has never asked them. */
  invite_status: InviteStatus | null;
};

/** An ask to join a circle. */
export type CircleInvitation = {
  id: string;
  status: InviteStatus;
  responded_at: string | null;
  created_at: string;
  circle?: Circle;
  inviter?: UserSummary;
};

/** GET /api/v1/circles/{id}/friends — mutual follows, with where each stands. */
export function fetchInvitableFriends(
  circleId: string,
  token: string,
  cursor?: string,
  perPage = CIRCLES_PER_PAGE
) {
  const query = new URLSearchParams({ per_page: String(perPage) });
  if (cursor) query.set('cursor', cursor);

  return apiGet<Page<InvitableFriend>>(
    `/api/v1/circles/${circleId}/friends?${query.toString()}`,
    token
  );
}

/** POST /api/v1/circles/{id}/invitations — ask somebody in. */
export async function inviteToCircle(circleId: string, userId: string, token: string) {
  const response = await apiPost<{ data: CircleInvitation }>(
    `/api/v1/circles/${circleId}/invitations`,
    { user_id: userId },
    token
  );

  return response.data;
}

/**
 * GET /api/v1/invitations — the asks waiting on you.
 *
 * What the alerts screen shows. Only pending ones come back: an invitation
 * already answered is not news.
 */
export function fetchInvitations(token: string, cursor?: string, perPage = CIRCLES_PER_PAGE) {
  const query = new URLSearchParams({ per_page: String(perPage) });
  if (cursor) query.set('cursor', cursor);

  return apiGet<Page<CircleInvitation>>(`/api/v1/invitations?${query.toString()}`, token);
}

/** POST /api/v1/invitations/{id}/accept — which is what actually joins you. */
export async function acceptInvitation(invitationId: string, token: string) {
  const response = await apiPost<{ data: CircleInvitation }>(
    `/api/v1/invitations/${invitationId}/accept`,
    undefined,
    token
  );

  return response.data;
}

/** POST /api/v1/invitations/{id}/decline. */
export async function declineInvitation(invitationId: string, token: string) {
  const response = await apiPost<{ data: CircleInvitation }>(
    `/api/v1/invitations/${invitationId}/decline`,
    undefined,
    token
  );

  return response.data;
}

/** DELETE /api/v1/circles/{id}/members/{userId} — owner only. */
export async function removeMember(circleId: string, userId: string, token: string) {
  const response = await apiDelete<{ data: { id: string; members_count: number } }>(
    `/api/v1/circles/${circleId}/members/${userId}`,
    token
  );

  return response.data;
}

/**
 * POST /api/v1/circles/{id}/blocks/{userId} — owner only.
 *
 * Removing takes back this membership; blocking stops the next one. The server
 * does both, and cancels any invitation still standing.
 */
export async function blockMember(circleId: string, userId: string, token: string) {
  const response = await apiPost<{
    data: { id: string; is_blocked: boolean; members_count: number };
  }>(`/api/v1/circles/${circleId}/blocks/${userId}`, undefined, token);

  return response.data;
}

/** DELETE /api/v1/circles/{id}/blocks/{userId} — clears the bar without rejoining them. */
export async function unblockMember(circleId: string, userId: string, token: string) {
  const response = await apiDelete<{ data: { id: string; is_blocked: boolean } }>(
    `/api/v1/circles/${circleId}/blocks/${userId}`,
    token
  );

  return response.data;
}

/** GET /api/v1/circles/{id}/blocks — who has been barred. Owner only. */
export function fetchBlockedMembers(
  circleId: string,
  token: string,
  cursor?: string,
  perPage = CIRCLES_PER_PAGE
) {
  const query = new URLSearchParams({ per_page: String(perPage) });
  if (cursor) query.set('cursor', cursor);

  return apiGet<Page<UserSummary>>(
    `/api/v1/circles/${circleId}/blocks?${query.toString()}`,
    token
  );
}
