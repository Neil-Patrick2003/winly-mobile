import * as Device from 'expo-device';

import { apiGet, apiPost } from '@/lib/api';

export type User = {
  /** A UUID, not a sequential integer — never do arithmetic or ordering on it. */
  id: string;
  full_name: string;
  username: string;
  email: string;
  avatar_url: string | null;
  /** Named gradient preset ("sunrise", …) rather than an uploaded image. */
  cover_gradient: string;
  /**
   * The uploaded banner across the top of the profile, or null.
   *
   * Sits over `cover_gradient` rather than replacing it: taking the photo
   * down reveals the gradient again instead of leaving the header blank.
   */
  cover_url: string | null;
  streak_days: number;
  /** The best run ever reached, which the profile shows beside the current one. */
  longest_streak: number;
  /**
   * How many times you have posted.
   *
   * Not the same as `wins_count`, which counts wins — one post logging all
   * three pillars moves that by three and this by one.
   */
  posts_count: number;
  wins_count: number;
  followers_count: number;
  following_count: number;
  /** Unlocks the admin rows on the profile. */
  is_admin: boolean;
  /**
   * True while you have a story that has not expired. The story rail reads this
   * to decide whether your bubble is an empty "add" control or your own live
   * story — so anything that posts or deletes one has to refresh the user.
   */
  has_active_story: boolean;
  /**
   * True when there is something about your own story you have not caught up
   * on: one you have posted and not yet opened the viewers on, or somebody
   * watching since the last time you did.
   *
   * What lights the ring on your own bubble. Everyone else's ring means "not
   * watched yet", which cannot mean anything about your own — so yours means
   * there is something waiting on the viewer list.
   */
  has_new_story_activity: boolean;
  bio: string | null;
  is_private: boolean;
  /** Null until the emailed verification link is followed. Informational only —
   *  nothing in the API gates on it yet. */
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthResponse = { user: User; token: string };

/** A label the user would recognise in a device list — "Neil's iPhone". */
export function getDeviceName() {
  return Device.deviceName ?? Device.modelName ?? 'Unknown device';
}

export type RegisterInput = {
  fullName: string;
  username: string;
  email: string;
  password: string;
  passwordConfirmation: string;
  /**
   * Whether the Terms and Privacy Policy were accepted.
   *
   * The server rejects a registration without it, and stamps its own clock on
   * the account rather than trusting a date sent from here — so this only ever
   * says that the box was ticked, never when.
   */
  termsAccepted: boolean;
};

/**
 * POST /api/v1/register — creates the user and returns a live token.
 *
 * The server trims and lowercases the username itself; doing it here too means
 * what the user sees validated is what actually gets stored.
 *
 * The display name goes over the wire as `full_name`, which is also the key its
 * 422 messages come back under.
 */
export function registerRequest(input: RegisterInput) {
  return apiPost<AuthResponse>('/api/v1/register', {
    full_name: input.fullName.trim(),
    username: input.username.trim().toLowerCase(),
    email: input.email.trim(),
    password: input.password,
    password_confirmation: input.passwordConfirmation,
    device_name: getDeviceName(),
    terms_accepted: input.termsAccepted,
  });
}

export type LoginInput = {
  email: string;
  password: string;
};

/**
 * POST /api/v1/login — email only; the API does not accept a username here.
 *
 * A wrong password, an unknown email and a deleted account all come back as the
 * same 422 under `errors.email`, deliberately, so the screen must not try to
 * work out which one it was.
 *
 * Each call mints an additional token rather than replacing the last one.
 */
export function loginRequest(input: LoginInput) {
  return apiPost<AuthResponse>('/api/v1/login', {
    email: input.email.trim(),
    password: input.password,
    device_name: getDeviceName(),
  });
}

/**
 * POST /api/v1/forgot-password — emails a six-digit code.
 *
 * Answers 200 whether or not the address has an account, and whether or not a
 * code was actually sent: the server will not send a second one inside a
 * minute. Nothing in the response distinguishes those cases, deliberately — so
 * the screen must move on to the code step regardless of what comes back.
 */
export function requestPasswordResetCode(email: string) {
  return apiPost<{ message: string }>('/api/v1/forgot-password', { email: email.trim() });
}

export type ResetPasswordInput = {
  email: string;
  code: string;
  password: string;
  passwordConfirmation: string;
};

/**
 * POST /api/v1/reset-password — spends the code and returns a live session.
 *
 * Every token the account had is revoked first, including any this device was
 * holding, and the one that comes back is the replacement. A wrong code, an
 * expired one and an unknown address all arrive as the same 422 under `code`.
 *
 * The code is good for 15 minutes and only once — a second attempt with the
 * same digits fails even if the first one succeeded.
 */
export function resetPasswordRequest(input: ResetPasswordInput) {
  return apiPost<AuthResponse>('/api/v1/reset-password', {
    email: input.email.trim(),
    code: input.code.trim(),
    password: input.password,
    password_confirmation: input.passwordConfirmation,
    device_name: getDeviceName(),
  });
}

/**
 * POST /api/v1/logout — deletes the token the request was made with, and only
 * that one. Sessions on the user's other devices are untouched. Responds 204.
 */
export function logoutRequest(token: string) {
  return apiPost<void>('/api/v1/logout', undefined, token);
}

/**
 * GET /api/v1/user — the authenticated user.
 *
 * Unlike register and login, which return the user unwrapped alongside the
 * token, this endpoint nests it under `data` (a Laravel API resource).
 */
export async function fetchUser(token: string) {
  const response = await apiGet<{ data: User }>('/api/v1/user', token);
  return response.data;
}
