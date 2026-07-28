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
  streak_days: number;
  wins_count: number;
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
