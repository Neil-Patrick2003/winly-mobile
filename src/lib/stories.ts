import { File } from 'expo-file-system';

import { apiDelete, apiGet, apiPost } from '@/lib/api';
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
};

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
};

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

  if (__DEV__) console.log('[stories] created\n' + JSON.stringify(response.data, null, 2));

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
