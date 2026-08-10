import { apiGet, apiPatch, apiPost } from '@/lib/api';
import type { User } from '@/lib/auth';
import { appendUpload, type LocalFile } from '@/lib/posts';

/** What `UpdateProfileRequest` accepts. Every field is optional — it patches. */
export type ProfileUpdate = {
  full_name?: string;
  username?: string;
  email?: string;
  /** `null` clears it; an empty bio is a valid profile. */
  bio?: string | null;
  is_private?: boolean;
  /**
   * A picked photo to upload, or `null` to take the current one down.
   *
   * Leave it out entirely to keep whatever is there — `undefined` and `null`
   * mean different things here.
   */
  avatar?: LocalFile | null;
  /**
   * The banner across the top of the profile, on the same terms as `avatar`.
   *
   * `null` takes it down and reveals `cover_gradient` again rather than leaving
   * the header blank — the gradient is what a profile wears until somebody
   * uploads something, and it is never cleared by this.
   */
  cover?: LocalFile | null;
};

/** Kept in step with `ProfileValidationRules`. */
export const NAME_MAX = 255;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const BIO_MAX = 500;

/** What the server will take: lowercase letters, digits and underscores. */
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;

/**
 * PATCH /api/v1/profile — change any subset of the profile.
 *
 * Sent as JSON unless there is a photo, which is where it gets awkward: PHP
 * only parses a multipart body on POST, so a multipart PATCH arrives with no
 * fields and no file at all. Laravel's `_method` override is the way round it —
 * the request goes out as a POST carrying `_method=PATCH`, and the router
 * treats it as the PATCH it claims to be.
 */
export async function updateProfile(input: ProfileUpdate, token: string) {
  const { avatar, cover, ...fields } = input;

  // Nothing said about either photo means nothing to upload, and JSON keeps its
  // real booleans rather than the "1"/"0" multipart forces.
  if (avatar === undefined && cover === undefined) {
    const response = await apiPatch<{ data: User }>('/api/v1/profile', fields, token);
    return response.data;
  }

  const form = new FormData();
  form.append('_method', 'PATCH');

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    // Laravel's `boolean` rule takes 1/0 and rejects the string "true".
    form.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value ?? ''));
  }

  /*
   * Each photo is only spoken about when the caller said something about it.
   *
   * `undefined` has to stay silent: sending `remove_cover` on an edit that only
   * changed the avatar would take down a cover nobody touched.
   */
  if (avatar !== undefined) {
    // Per-platform — see `appendUpload`. On web the picker's DOM `File` is the
    // only thing there is to send; `expo-file-system` has no web build.
    if (avatar) appendUpload(form, 'avatar', avatar);
    else form.append('remove_avatar', '1');
  }

  if (cover !== undefined) {
    if (cover) appendUpload(form, 'cover', cover);
    else form.append('remove_cover', '1');
  }

  const response = await apiPost<{ data: User }>('/api/v1/profile', form, token);
  return response.data;
}

/**
 * Somebody else's profile, as `GET /api/v1/users/{id}` reports it.
 *
 * The private half — email, verification, admin — is absent rather than nulled
 * when the profile is not yours, so a client cannot mistake "not yours to see"
 * for "not set". `is_self` says which case you are in.
 */
export type PublicProfile = {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  cover_gradient: string;
  /** The uploaded banner, or null where they have not set one. */
  cover_url: string | null;

  /** Times posted. Not `wins_count`, which counts the wins those posts carry. */
  posts_count: number;
  wins_count: number;
  followers_count: number;
  following_count: number;

  /** The run still standing, not the stored column. */
  streak_days: number;
  longest_streak: number;
  last_win_on: string | null;

  is_private: boolean;
  is_self: boolean;
  /** Absent where the endpoint did not look — not the same as false. */
  is_following?: boolean;
  /** Whether they follow you back. */
  follows_you?: boolean;
  has_active_story?: boolean;

  created_at: string;
};

/** GET /api/v1/users/{id} — a profile to visit. */
export async function fetchUserProfile(userId: string, token: string) {
  const response = await apiGet<{ data: PublicProfile }>(`/api/v1/users/${userId}`, token);

  return response.data;
}
