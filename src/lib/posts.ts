import { File } from 'expo-file-system';

import { apiGet, apiPost } from '@/lib/api';

/**
 * A post is one shared moment carrying up to three wins — not one post per
 * pillar. `POST /api/v1/posts` takes a single `caption` and a `wins` array.
 */
export type WinType = 'meditation' | 'learning' | 'movement';

/** What the feed returns for each win, discriminated on `type`. */
type WinBase = {
  completed_at: string;
  media_attached: boolean;
  media: Media[];
};

export type Win =
  | (WinBase & {
      type: 'meditation';
      duration_minutes: number;
      /** False when they stopped the timer early. */
      completed: boolean;
    })
  | (WinBase & {
      type: 'learning';
      learned_text: string;
      reference_source: string | null;
    })
  | (WinBase & { type: 'movement'; movement_type: MovementType | null });

export type PostAuthor = {
  id: string;
  full_name: string;
  /** Nullable — never render "@" against it unguarded. */
  username: string | null;
  avatar_url: string | null;
};

export type Post = {
  id: string;
  caption: string | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
  author: PostAuthor;
  /** Always an array — `[]` when the post has none. Ordered as WIN_ORDER. */
  wins: Win[];
};

/** Laravel's cursor-paginated envelope. */
export type Page<T> = {
  data: T[];
  meta: {
    per_page: number;
    next_cursor: string | null;
    prev_cursor: string | null;
  };
};

/**
 * A file straight from the picker, in the shape React Native's `FormData`
 * understands. `name` and `type` are what the server sees — it infers image vs
 * video from the MIME type, so `type` has to be right.
 */
export type LocalFile = {
  /** file:///var/mobile/.../IMG_0042.jpg */
  uri: string;
  name: string;
  type: string;
};

/** Media as the feed returns it, once hosted. */
export type Media = {
  id: string;
  url: string;
  kind: 'image' | 'video';
  position: number;
};

/**
 * What we send. One win is the minimum for a post; `caption` is optional.
 *
 * Only `duration_minutes` and `learned_text` are actually required by their
 * types — a movement win is valid with nothing but `type`. `completed_at`
 * defaults to now server-side, so it is only worth sending for a win being
 * backdated, which this app has no way to express yet.
 */
type NewWinBase = { completed_at?: string; media?: LocalFile[] };

export type NewWin =
  | (NewWinBase & {
      type: 'meditation';
      duration_minutes: number;
      completed?: boolean;
    })
  | (NewWinBase & {
      type: 'learning';
      learned_text: string;
      reference_source?: string;
    })
  | (NewWinBase & { type: 'movement'; movement_type?: MovementType });

export type CreatePostInput = {
  caption?: string;
  /** At least one — a post with no wins is rejected. */
  wins: NewWin[];
};

export const WIN_LABEL: Record<WinType, string> = {
  meditation: 'Meditation',
  learning: 'Learning',
  movement: 'Movement',
};

/** The longest `movement_type` the column takes. */
const MOVEMENT_TYPE_MAX = 255;

/**
 * The vocabulary the chips map onto. The server used to hold this list; it no
 * longer does, so these are the values we agree to keep producing rather than
 * values anything validates against.
 */
export type KnownMovementType =
  'walk' | 'run' | 'cycle' | 'swim' | 'gym' | 'yoga' | 'stretch' | 'other';

/**
 * What the column holds. Open on purpose: a typed "Others" activity goes out as
 * itself, so anything a person can write is a valid movement type.
 *
 * `string & {}` is what keeps the known values in autocomplete — widening the
 * union with a bare `string` would collapse it back to `string` and lose them.
 */
export type MovementType = KnownMovementType | (string & {});

/**
 * The `movement_type` the API suggests, from the chip label the draft stores.
 *
 * The chips are written for people and these values are written for the
 * database, so the two are mapped explicitly rather than derived — renaming a
 * chip must not silently change what gets stored. Typing the values as
 * `KnownMovementType` is what keeps this table and the vocabulary in step; the
 * server no longer checks, so nothing else would catch a drifting value.
 */
const MOVEMENT_TYPES: Record<string, KnownMovementType> = {
  'Morning Walk': 'walk',
  Run: 'run',
  Yoga: 'yoga',
  Gym: 'gym',
  Stretching: 'stretch',
  Cycling: 'cycle',
};

/**
 * Turn a chip label into what we send.
 *
 * `freeText` is what they typed under "Others". The field is free text rather
 * than an enum, so that goes out as the movement type itself — collapsing it to
 * `other` would throw away the only record of what they actually did. It is
 * slugified so a typed activity and a chip look the same in the column, which
 * is what lets `humanizeMovementType` read either back.
 */
export function toMovementType(label: string, freeText = ''): MovementType {
  const known = MOVEMENT_TYPES[label];
  if (known) return known;

  const slug = freeText.trim().toLowerCase().replace(/\s+/g, '_').slice(0, MOVEMENT_TYPE_MAX);

  return slug || 'other';
}

/** "cycling" → "Cycling", "morning_walk" → "Morning walk". */
export function humanizeMovementType(value: MovementType) {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isLocalFile(value: unknown): value is LocalFile {
  return (
    typeof value === 'object' && value !== null && typeof (value as LocalFile).uri === 'string'
  );
}

function append(form: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null) return;

  // This branch MUST come before the generic object one. A LocalFile is a plain
  // object, so a naive encoder walks into it and emits media[0][uri],
  // media[0][name], media[0][type] — three harmless strings, and the server
  // sees no upload at all.
  //
  // The file is handed over as a `File`, not as the `{ uri, name, type }` shape
  // React Native's own FormData takes. Expo installs a WinterCG `fetch` as the
  // global, and its encoder accepts only a string, a Blob, or something with
  // `bytes()` — the bare object throws "Unsupported FormDataPart implementation"
  // before the request is ever sent.
  if (isLocalFile(value)) {
    form.append(key, new File(value.uri) as unknown as Blob);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      // Files repeat under `media[]`; everything else keeps its index, because
      // the server reads wins back by position.
      append(form, isLocalFile(item) ? `${key}[]` : `${key}[${index}]`, item);
    });
    return;
  }

  if (typeof value === 'object') {
    for (const [nested, item] of Object.entries(value as Record<string, unknown>)) {
      append(form, `${key}[${nested}]`, item);
    }
    return;
  }

  // Laravel's `boolean` rule takes 1/0 and rejects the string "true", which is
  // exactly what String(true) would produce.
  form.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
}

/** Flatten a post into the bracketed field names the multipart endpoint wants. */
export function toFormData(input: CreatePostInput): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) append(form, key, value);
  return form;
}

const hasFiles = (input: CreatePostInput) => input.wins.some((win) => (win.media?.length ?? 0) > 0);

/**
 * POST /api/v1/posts — creates the post and returns it under `data`.
 *
 * Multipart only when there are files to carry. JSON keeps its real numbers and
 * booleans, so the common path avoids the string coercion multipart forces.
 */
export async function createPost(input: CreatePostInput, token: string) {
  const multipart = hasFiles(input);

  const response = await apiPost<{ data: Post }>(
    '/api/v1/posts',
    multipart ? toFormData(input) : input,
    token
  );

  return response.data;
}

/** The server's own default; 50 is the ceiling it enforces. */
const PER_PAGE = 15;

/**
 * GET /api/v1/posts — newest first, cursor paginated.
 *
 * `meta.next_cursor` is null on the last page; that, rather than an empty
 * `data`, is what says there is nothing more to ask for. Cursors are opaque and
 * come only from the server — never build one.
 */
export async function fetchFeed(token: string, cursor?: string, perPage = PER_PAGE) {
  const query = new URLSearchParams({ per_page: String(perPage) });
  if (cursor) query.set('cursor', cursor);

  return apiGet<Page<Post>>(`/api/v1/posts?${query.toString()}`, token);
}

/**
 * Turn a 422 into something a person can act on.
 *
 * Validation keys are indexed against the array we sent — `wins.1.duration_minutes`,
 * not `duration_minutes` — so which step is at fault is only knowable by
 * looking that index up in the payload.
 */
export function describeWinErrors(fieldErrors: Record<string, string>, wins: NewWin[]) {
  const lines = Object.entries(fieldErrors).map(([key, message]) => {
    const index = /^wins\.(\d+)\./.exec(key)?.[1];
    if (index === undefined) return message;

    const win = wins[Number(index)];
    return win ? `${WIN_LABEL[win.type]}: ${message}` : message;
  });

  return lines.join('\n');
}
