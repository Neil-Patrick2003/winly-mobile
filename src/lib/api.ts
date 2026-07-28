/**
 * Thin fetch wrapper for the Laravel backend.
 *
 * The base URL is overridable because `winly-backend.test` is a Herd/Valet
 * domain resolved by the Mac's DNS: the iOS simulator inherits that, but a
 * physical device or an Android emulator does not. Point EXPO_PUBLIC_API_URL at
 * the machine's LAN address there.
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://winly-backend.test';

/** Laravel's validation-error envelope. */
type LaravelErrorBody = {
  message?: string;
  errors?: Record<string, string[]>;
};

export class ApiError extends Error {
  readonly status: number;
  /** First message per field, keyed by the API's field name (`username`, …). */
  readonly fieldErrors: Record<string, string>;
  /** Seconds to wait, from `Retry-After`, when the status is 429. */
  readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    message: string,
    fieldErrors: Record<string, string> = {},
    retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Thrown when the request never completed at the transport level.
 *
 * An upload gets its own wording. A server that caps the request body answers
 * 413 and closes the connection while the body is still going out, which
 * surfaces here as a write failure rather than as a readable response — telling
 * someone to check their connection would send them looking in the wrong place.
 * The original error is kept as `cause`, since its message is the only thing
 * that distinguishes a timeout from a refused connection.
 */
export class NetworkError extends Error {
  constructor(cause?: unknown, upload = false) {
    const summary = upload
      ? 'The upload did not go through. The file may be too large, or the connection dropped.'
      : 'Could not reach the server. Check your connection and try again.';

    // The underlying message is the only thing that separates a timeout from a
    // refused connection from a reset mid-body, and it is unreadable to anyone
    // but us — so it rides along in dev builds and nowhere else.
    const detail = cause instanceof Error ? cause.message : undefined;

    super(__DEV__ && detail ? `${summary}\n\n[dev] ${detail}` : summary, { cause });
    this.name = 'NetworkError';
  }
}

function toFieldErrors(errors: Record<string, string[]> | undefined) {
  const flat: Record<string, string> = {};
  for (const [field, messages] of Object.entries(errors ?? {})) {
    if (messages[0]) flat[field] = messages[0];
  }
  return flat;
}

type RequestOptions = {
  /** A `FormData` body is sent as multipart; anything else is JSON. */
  body?: unknown;
  /** Sanctum personal access token, sent as a bearer credential. */
  token?: string | null;
};

async function apiRequest<TResponse>(
  method: 'GET' | 'POST',
  path: string,
  { body, token }: RequestOptions = {}
): Promise<TResponse> {
  const multipart = body instanceof FormData;
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        // Without this Laravel answers validation failures with a redirect
        // instead of the 422 JSON body.
        Accept: 'application/json',
        // Deliberately absent for multipart: fetch has to generate the boundary
        // itself, and setting the header by hand breaks parsing entirely.
        ...(body === undefined || multipart ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    });
  } catch (caught) {
    throw new NetworkError(caught, multipart);
  }

  // 204 No Content has no body to parse.
  if (response.ok) {
    if (response.status === 204) return undefined as TResponse;
    return (await response.json().catch(() => undefined)) as TResponse;
  }

  // Read as text first and parse defensively. An oversized upload is rejected
  // by the web server before PHP runs, and answered with an HTML page — calling
  // `.json()` on that throws.
  const raw = await response.text().catch(() => '');
  let data: LaravelErrorBody = {};
  try {
    data = JSON.parse(raw) as LaravelErrorBody;
  } catch {
    if (response.status === 413) {
      throw new ApiError(413, 'That file is too large to upload. Try a smaller one.');
    }
    throw new ApiError(response.status, 'The server sent something unexpected.');
  }

  if (response.status === 413) {
    throw new ApiError(
      413,
      data.message ?? 'That file is too large to upload. Try a smaller one.'
    );
  }

  if (response.status === 429) {
    const header = Number(response.headers.get('Retry-After'));
    // The login limiter states the wait in its message rather than the header,
    // so fall back to the first number there before giving up on 60.
    const fromMessage = Number(data.message?.match(/(\d+)\s*second/i)?.[1]);
    const seconds = [header, fromMessage].find((value) => Number.isFinite(value) && value > 0) ?? 60;

    throw new ApiError(
      429,
      data.message ?? 'Too many attempts. Please wait a moment before trying again.',
      {},
      seconds
    );
  }

  throw new ApiError(
    response.status,
    data.message ?? 'Something went wrong. Please try again.',
    toFieldErrors(data.errors)
  );
}

export function apiGet<TResponse>(path: string, token?: string | null) {
  return apiRequest<TResponse>('GET', path, { token });
}

export function apiPost<TResponse>(path: string, body?: unknown, token?: string | null) {
  return apiRequest<TResponse>('POST', path, { body, token });
}
