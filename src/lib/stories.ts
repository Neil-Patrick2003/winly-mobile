import { File } from 'expo-file-system';

import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type { LocalFile, Page } from '@/lib/posts';

/**
 * A person as every list hands them over — follow lists, feed authors, comment
 * authors. `is_following` is from the *caller's* perspective: browsing someone
 * else's following list, each row says whether you follow that person, so a
 * Follow button renders straight off the row.
 */
export type UserSummary = {
  id: string;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
  is_following: boolean;
  /** True while they have a story whose `expires_at` is still ahead. */
  has_active_story: boolean;
  /**
   * True while any of those stories is still unwatched by the caller.
   *
   * What separates a bright ring from a spent one: someone with a live story
   * you have already seen through keeps their ring, in a quieter colour.
   */
  has_unseen_story: boolean;
};

/**
 * The reactions a story can carry, in the order they are offered.
 *
 * Mirrors `StoryReaction::TYPES`. The server rejects anything else, so the two
 * lists have to agree — a reaction one client invents is one no other client
 * can draw.
 */
export const STORY_REACTIONS = [
  { type: 'like', emoji: '👍', label: 'Like' },
  { type: 'love', emoji: '❤️', label: 'Love' },
  { type: 'celebrate', emoji: '🎉', label: 'Celebrate' },
  { type: 'support', emoji: '🤝', label: 'Support' },
  { type: 'insightful', emoji: '💡', label: 'Insightful' },
] as const;

export type StoryReactionType = (typeof STORY_REACTIONS)[number]['type'];

export type Story = {
  id: string;
  image_url: string;
  caption: string | null;
  /** Set server-side to +24h. Anything the client sends is discarded. */
  expires_at: string;
  /**
   * Whether the story is still live, decided by the server.
   *
   * Provided so the client never has to compare `expires_at` against a device
   * clock, which can disagree with the server's by enough to matter on a
   * 24-hour window.
   */
  is_active: boolean;
  created_at: string;
  /** Whether the reader has already watched this one. */
  viewed: boolean;
  /**
   * How many people have watched it — sent to the poster and to nobody else,
   * so it is absent rather than zero on someone else's story.
   */
  views_count?: number;
  /** How many reactions it has drawn. Sent to the poster alone, like the views. */
  reactions_count?: number;
  /**
   * Which kinds came in, most common first — distinct types, not one entry per
   * person. Sent to the poster alone.
   */
  reaction_types?: StoryReactionType[];
  /**
   * The reader's own reaction, `null` where they have not left one.
   *
   * Absent — as opposed to null — where the endpoint did not look, which is
   * every one but the list.
   */
  viewer_reaction?: StoryReactionType | null;
  /** Present on the list endpoint; absent where the caller already knows who posted. */
  author?: UserSummary;
};

/** Somebody who watched a story, when, and what they left on it. */
export type StoryViewer = UserSummary & {
  viewed_at: string;
  /** Null for the many who watched without reacting. */
  reaction_type: StoryReactionType | null;
};

/** The emoji for a reaction type, for drawing one somebody else chose. */
export function reactionEmoji(type: StoryReactionType) {
  return STORY_REACTIONS.find((reaction) => reaction.type === type)?.emoji ?? '';
}

/**
 * One person's run of active stories, which is how they are watched: you open
 * someone's ring and see everything they have posted since yesterday, oldest
 * first.
 */
export type StoryReel = {
  author: UserSummary;
  /** Oldest first — the order they are meant to be watched in. */
  stories: Story[];
  /** False once every story in the run has been watched. Drives the ring. */
  has_unseen: boolean;
};

/**
 * GET /api/v1/stories — active stories from you and the people you follow.
 *
 * Not paginated, and deliberately: the window is 24 hours and the audience is
 * people you chose, so the whole set arrives at once. Reels come back with the
 * reader's own first, then whoever has something unwatched.
 */
export async function fetchStoryReels(token: string) {
  const response = await apiGet<{ data: StoryReel[] }>('/api/v1/stories', token);

  return response.data;
}

/**
 * POST /api/v1/stories/{id}/view — mark one as watched.
 *
 * Idempotent, so a client that loses track may say so again. Watching your own
 * story is accepted and deliberately not counted.
 */
export async function markStoryViewed(storyId: string, token: string) {
  const response = await apiPost<{ data: { id: string; views_count: number } }>(
    `/api/v1/stories/${storyId}/view`,
    undefined,
    token
  );

  return response.data;
}

/**
 * GET /api/v1/stories/{id}/views — who watched it, most recent first.
 *
 * Only the poster may ask; anyone else gets a 403. Cursor paginated, unlike
 * the reel list: a story from someone widely followed can be watched by all of
 * them, with no 24-hour window narrowing the answer.
 */
export function fetchStoryViewers(
  storyId: string,
  token: string,
  cursor?: string,
  perPage = VIEWERS_PER_PAGE
) {
  const query = new URLSearchParams({ per_page: String(perPage) });
  if (cursor) query.set('cursor', cursor);

  return apiGet<Page<StoryViewer>>(
    `/api/v1/stories/${storyId}/views?${query.toString()}`,
    token
  );
}

/** What one reaction call says about the story afterwards. */
type ReactionState = {
  id: string;
  viewer_reaction: StoryReactionType | null;
  reactions_count: number;
};

/**
 * PUT /api/v1/stories/{id}/reaction — react, or change the reaction already left.
 *
 * A PUT because one person holds one reaction to one story: sending the same
 * one twice leaves things as they were, rather than stacking up.
 */
export async function reactToStory(
  storyId: string,
  reaction: StoryReactionType,
  token: string
) {
  const response = await apiPut<{ data: ReactionState }>(
    `/api/v1/stories/${storyId}/reaction`,
    { reaction_type: reaction },
    token
  );

  return response.data;
}

/** DELETE /api/v1/stories/{id}/reaction — take it back. */
export async function removeStoryReaction(storyId: string, token: string) {
  const response = await apiDelete<{ data: ReactionState }>(
    `/api/v1/stories/${storyId}/reaction`,
    token
  );

  return response.data;
}

/** The viewers endpoint's own default; 50 is the ceiling. */
const VIEWERS_PER_PAGE = 20;

/** The follow endpoints' own default; 50 is the ceiling. */
const FOLLOWS_PER_PAGE = 20;

/**
 * GET /api/v1/users/{id}/following — or /followers.
 *
 * Cursor paginated, most-recently-followed first. Same envelope as the feed:
 * `meta.next_cursor` going null is what says there is no more to ask for.
 */
export function fetchFollows(
  userId: string,
  relation: 'following' | 'followers',
  token: string,
  cursor?: string,
  perPage = FOLLOWS_PER_PAGE
) {
  const query = new URLSearchParams({ per_page: String(perPage) });
  if (cursor) query.set('cursor', cursor);

  return apiGet<Page<UserSummary>>(
    `/api/v1/users/${userId}/${relation}?${query.toString()}`,
    token
  );
}

/**
 * POST /api/v1/stories — multipart, one image and an optional caption.
 *
 * Photos only: the stories table holds a single `image_url` and nothing
 * recording what kind of file it is, so a video would arrive with no way for a
 * client to know to play rather than display it. The server answers a video
 * with a 422.
 */
export async function createStory(image: LocalFile, caption: string, token: string) {
  const form = new FormData();
  // The picker's `{ uri, name, type }` is not what Expo's WinterCG FormData
  // accepts — it takes a string, a Blob, or something with `bytes()`. The same
  // `File` wrapper the post upload uses is what makes this a real upload rather
  // than three stringified fields.
  form.append('image', new File(image.uri) as unknown as Blob);

  const trimmed = caption.trim();
  if (trimmed) form.append('caption', trimmed);

  const response = await apiPost<{ data: Story }>('/api/v1/stories', form, token);

  return response.data;
}

/**
 * DELETE /api/v1/stories/{id} — only the poster may; anyone else gets a 403.
 */
export async function deleteStory(storyId: string, token: string) {
  const response = await apiDelete<{ data: { id: string } }>(
    `/api/v1/stories/${storyId}`,
    token
  );

  return response.data;
}
