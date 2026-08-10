import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';
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
  /**
   * Whether it is kept out of Discover and out of search.
   *
   * About being found rather than being read: the ways into a private circle
   * are an invitation and a link from somebody already inside. Everything made
   * before the choice existed is public, which is what the forms default to.
   */
  is_private: boolean;
  /**
   * The circle this one sits inside, or null when it stands on its own.
   *
   * A sub-circle is a smaller room in a bigger house: its members are drawn
   * from the parent's, and a win shared into it carries out to the parent as
   * well. One level only — a room cannot hold rooms.
   */
  parent_id: string | null;
  is_sub_circle: boolean;
  /**
   * The circle it sits inside, by name, where the endpoint loaded it.
   *
   * Enough to write "Beginners (Morning Sitters)" and no more — a screen that
   * wants the whole parent can ask for it by id.
   */
  parent?: { id: string; name: string } | null;
  /**
   * How many of your own wins are not on this circle's wall yet.
   *
   * A win goes to the circles you were in when you posted it, so a circle
   * joined later has none of your history. Absent where the endpoint did not
   * work it out — only the circle's own screen asks.
   */
  syncable_posts_count?: number;
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
 * Public unless `isPrivate` says otherwise. A private circle is kept out of
 * Discover and out of search, so the only ways in are an invitation and a link
 * from somebody already inside.
 */
export async function createCircle(
  fields: { name: string; description?: string; tag?: string; isPrivate?: boolean },
  token: string
) {
  const body: Record<string, string | boolean> = { name: fields.name.trim() };

  const description = fields.description?.trim();
  if (description) body.description = description;

  const tag = fields.tag?.trim();
  if (tag) body.tag = tag;

  // Sent either way rather than only when true: this is the one field where the
  // form has an answer even when nobody touched it.
  body.is_private = fields.isPrivate ?? false;

  const response = await apiPost<{ data: Circle }>('/api/v1/circles', body, token);

  return response.data;
}

/**
 * PATCH /api/v1/circles/{id} — rename it, or say again what it is for.
 *
 * The owner's alone; anyone else gets a 403. Only what is sent changes, so a
 * cleared box has to arrive as an explicit `null` — leaving the field out means
 * "as it was", which is what lets a form send the name on its own.
 *
 * The badge letter follows a rename server-side. The colour does not: it is how
 * the circle is picked out of a list, and it stays the one people know.
 *
 * `isPrivate` follows the same rule as the rest: leaving it out keeps the
 * circle as it is. Turning one private hides it from Discover and search
 * without turning anybody out — the people inside were let in, and what is on
 * the wall was shared with them.
 */
export async function updateCircle(
  circleId: string,
  fields: {
    name: string;
    description?: string | null;
    tag?: string | null;
    isPrivate?: boolean;
  },
  token: string
) {
  const body: Record<string, string | boolean | null> = { name: fields.name.trim() };

  if (fields.description !== undefined) body.description = fields.description?.trim() || null;
  if (fields.tag !== undefined) body.tag = fields.tag?.trim() || null;
  if (fields.isPrivate !== undefined) body.is_private = fields.isPrivate;

  const response = await apiPatch<{ data: Circle }>(
    `/api/v1/circles/${circleId}`,
    body,
    token
  );

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
type MembershipState = {
  id: string;
  is_member: boolean;
  members_count: number;
  /**
   * How many of your earlier wins this circle has not seen.
   *
   * Sent by joining so the screen can offer to bring them in there and then.
   * Asked later it would be asked after the person has moved on, and an offer
   * nobody is still looking at is the same as no offer.
   */
  syncable_posts_count: number;
};

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
/**
 * GET /api/v1/circles/{id}/sub-circles — the rooms inside one circle.
 *
 * Answered to anybody who may see the parent: knowing a group has a beginners'
 * room is not the same as being able to read it, and each room's wall is still
 * gated on its own. Not paginated — a circle with more rooms than one answer
 * holds has outgrown the shape.
 */
/**
 * POST /api/v1/circles/{id}/sync-my-posts — bring your earlier wins in.
 *
 * Members only, and your own wins only. Any of them, whatever each was shared
 * to when you wrote it: you are standing in the circle asking, which is the
 * same choice as picking it at the time. Pressing twice shares nothing twice,
 * and it never unshares what is already on the wall.
 */
export async function syncMyPostsToCircle(circleId: string, token: string) {
  const response = await apiPost<{
    data: { id: string; shared: number; syncable_posts_count: number };
  }>(`/api/v1/circles/${circleId}/sync-my-posts`, undefined, token);

  return response.data;
}

/**
 * What to ask before bringing somebody's earlier wins into a circle.
 *
 * Written once and shared by both places that ask — the circle's own screen and
 * the Discover row — because the two are the same question and would otherwise
 * be two sets of sentences drifting apart. What it must keep saying is that the
 * circle's members will be able to read them: some were written for other
 * circles, and a message implying otherwise is the one place this could
 * genuinely surprise somebody.
 *
 * `justJoined` words it as an arrival. Asked out of nowhere, the same question
 * reads as the app having decided something about your history unprompted.
 */
export function syncPostsPrompt(circleName: string, total: number, justJoined = false) {
  const label = `${total} ${total === 1 ? 'post' : 'posts'}`;

  return {
    title: justJoined ? `Bring your ${label} with you?` : `Add your ${label}?`,
    message:
      total === 1
        ? `It goes on ${circleName}'s wall, where everyone in the circle can read it. It stays wherever else you shared it.`
        : `They go on ${circleName}'s wall, where everyone in the circle can read them. They stay wherever else you shared them.`,
    confirmLabel: 'Add them',
  };
}

/** "1 post" / "8 posts", which every string about them needs. */
export function postCountLabel(total: number) {
  return `${total} ${total === 1 ? 'post' : 'posts'}`;
}

export async function fetchSubCircles(circleId: string, token: string) {
  const response = await apiGet<{ data: Circle[] }>(
    `/api/v1/circles/${circleId}/sub-circles`,
    token
  );

  return response.data;
}

/**
 * PUT /api/v1/circles/{id}/owner/{user} — hand a room to one of its members.
 *
 * The parent's owner decides who keeps the room they opened. Only a sub-circle
 * has this, and only somebody already in it can be given it.
 */
export async function assignCircleOwner(circleId: string, userId: string, token: string) {
  const response = await apiPut<{ data: Circle }>(
    `/api/v1/circles/${circleId}/owner/${userId}`,
    undefined,
    token
  );

  return response.data;
}

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
