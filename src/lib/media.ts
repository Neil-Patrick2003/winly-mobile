import { File } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Platform } from 'react-native';

import { API_BASE_URL } from '@/lib/api';
import type { LocalFile } from '@/lib/posts';

/** A host only the machine running the backend can resolve. */
function isLocalHost(host: string) {
  const name = host.split(':')[0].toLowerCase();

  return (
    name === 'localhost' ||
    name === '127.0.0.1' ||
    name.endsWith('.test') ||
    name.endsWith('.local') ||
    /^10\./.test(name) ||
    /^192\.168\./.test(name) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(name)
  );
}

/**
 * Point a server-supplied media URL at the host the app is actually talking to.
 *
 * Laravel builds absolute URLs from `APP_URL`, which here is the local Herd
 * hostname — `http://winly-backend.test/storage/…`. Reaching the backend
 * through a tunnel or a LAN address, the device cannot resolve that name, so
 * the JSON arrives perfectly and every image fails. Swapping the origin for
 * `API_BASE_URL` also upgrades http to https when the tunnel is https, which
 * iOS requires of a page already loaded over TLS.
 *
 * Only *local-looking* hosts are rewritten, so a real CDN URL is left alone.
 * Anything that is not an http(s) URL — a `file://` from the picker — passes
 * through untouched.
 *
 * The durable fix is `APP_URL` on the backend. This keeps the client working
 * whatever it happens to be set to.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  const base = API_BASE_URL.replace(/\/+$/, '');
  if (url.startsWith('/')) return `${base}${url}`;

  const parts = /^https?:\/\/([^/]+)(\/.*)?$/i.exec(url);
  if (!parts) return url;

  const [, host, path = ''] = parts;
  const baseHost = /^https?:\/\/([^/]+)/i.exec(base)?.[1];
  if (host === baseHost) return url;

  return isLocalHost(host) ? `${base}${path}` : url;
}

/**
 * Headers an image request needs, if any.
 *
 * ngrok's free tier answers anything with a browser-like User-Agent with an
 * HTML interstitial rather than the file. `fetch` escapes it because of the
 * `Accept: application/json` we send, but expo-image loads through the platform
 * URL loader with a browser UA, so every image comes back as a 2.8KB HTML page
 * with a 200 — the request looks like it worked and nothing renders.
 *
 * Harmless anywhere else, but kept to ngrok hosts so it does not follow the
 * media URL to production.
 */
export function mediaHeaders(url: string | null): Record<string, string> | undefined {
  if (!url) return undefined;

  const host = /^https?:\/\/([^/]+)/i.exec(url)?.[1] ?? '';
  return /\bngrok[\w.-]*\.(dev|io|app)$/i.test(host.split(':')[0])
    ? { 'ngrok-skip-browser-warning': 'true' }
    : undefined;
}

/**
 * Longest edge we upload. A phone camera hands back something like 4032×3024,
 * which is far more than a feed card ever shows — 1600px still looks sharp on a
 * 3x screen and cuts the file to a fraction of the original.
 */
const MAX_DIMENSION = 1600;

/** Re-encode quality. 0.7 is where JPEG artefacts stop being visible at this size. */
const COMPRESS = 0.7;

/**
 * Skip the round trip for anything already small. Re-encoding a 200KB photo
 * costs time and quality and saves nothing.
 */
const SKIP_BELOW_BYTES = 600 * 1024;

/** The ceiling for a single attachment. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * The ceiling for one post's attachments put together.
 *
 * Set by nginx, not by us. Both Forge hosts answer 413 to a request body over
 * 10MB — measured, not assumed: 10MB reaches Laravel and 11MB does not, on
 * `welle-backend.on-forge.com` and `winly.on-forge.com` alike. Nothing in this
 * repo or in `public/.user.ini` can lift that; `client_max_body_size` decides
 * it before PHP is handed the request at all.
 *
 * 9MB rather than 10 leaves room for the part headers, the boundaries and the
 * text fields riding alongside the photos, none of which are counted here but
 * all of which nginx counts.
 *
 * This is the limit worth fixing on the server rather than living with — it
 * sits *below* the 10MB per photo that both this app and the API's own
 * `MediaFile` rule say is allowed, so a single photo at the documented maximum
 * cannot be uploaded. Raise `client_max_body_size` and raise this with it.
 */
export const MAX_POST_BYTES = 9 * 1024 * 1024;

/**
 * The largest single photo that can actually be sent, whichever cap binds
 * first.
 *
 * A photo bigger than a whole post may be is not sendable however generous the
 * per-file rule is, and the picker should say so when it is picked rather than
 * let the total say it at the end of the flow. Today the post budget is the
 * smaller of the two; raise `client_max_body_size` and the per-file rule takes
 * over again without this needing to change.
 */
export const MAX_PHOTO_BYTES = Math.min(MAX_UPLOAD_BYTES, MAX_POST_BYTES);

/** "10 MB", "8.4 MB" — bytes as something to put in an alert. */
export function formatBytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 || Number.isInteger(mb) ? Math.round(mb) : mb.toFixed(1)} MB`;
}

/**
 * What a prepared file will put on the wire, or 0 when that cannot be worked
 * out.
 *
 * 0 means "unknown", not "empty": `expo-file-system` reports 0 for a file it
 * cannot read, and web cannot be asked at all. Callers here treat unknown as
 * passing — a size we could not measure is not grounds to turn a photo away,
 * and the upload is the better judge of it.
 */
export function sizeOf(file: LocalFile): number {
  // Web measures the bytes it already holds. It cannot ask `expo-file-system`,
  // which has no web implementation: `new File(uri)` there is a stub carrying
  // no `size` at all, so asking it in a browser reads every photo as unknown.
  if (file.blob) return file.blob.size;

  try {
    return new File(file.uri).size;
  } catch {
    return 0;
  }
}

/**
 * Whether a prepared file is small enough to send.
 *
 * Checked after `shrinkAsset`, because that is what decides the real size — a
 * 12MB camera photo comes out well under the cap, so measuring the original
 * would reject files that were never going to be a problem.
 *
 * Judged against `MAX_PHOTO_BYTES`, so the answer matches what the upload will
 * actually accept rather than what the per-file rule alone would allow.
 */
export function isWithinUploadLimit(file: LocalFile) {
  const size = sizeOf(file);
  return size === 0 || size <= MAX_PHOTO_BYTES;
}

/**
 * What a set of attachments comes to, skipping the ones that cannot be
 * measured.
 *
 * An undercount is the deliberate failure mode: this guards against a request
 * too big to send, and blocking a share over bytes we never actually saw would
 * be a worse outcome than letting the upload try.
 */
export function totalUploadBytes(files: LocalFile[]): number {
  return files.reduce((total, file) => total + sizeOf(file), 0);
}

/**
 * The bytes behind a URI, where the platform needs them handed over rather than
 * named.
 *
 * Web only, and only worth calling after a photo has been re-encoded: the DOM
 * `File` the picker gave us describes what went into the manipulator, not what
 * came out of it. `fetch` reads a `blob:` or `data:` URL straight out of memory,
 * so this touches no network.
 *
 * Undefined on native, where a URI is all an upload needs.
 */
async function bytesFor(uri: string): Promise<Blob | undefined> {
  if (Platform.OS !== 'web') return undefined;

  try {
    return await (await fetch(uri)).blob();
  } catch {
    // Left undefined rather than thrown: the upload itself reports a missing
    // file far better than a shrink step can.
    return undefined;
  }
}

/**
 * Shrink a picked photo to something worth uploading.
 *
 * This is not only about bandwidth: an unshrunk photo is several megabytes, and
 * a server that caps the request body answers 413 and hangs up *while the body
 * is still being sent* — the client never gets to read that response and sees a
 * plain connection failure instead. Sending less avoids the whole class of it.
 *
 * Videos are returned untouched: this module cannot transcode them. Nothing
 * picks them any more, but the branch stays so a video reaching here is passed
 * along rather than silently mangled into a JPEG.
 */
export async function shrinkAsset(asset: ImagePickerAsset): Promise<LocalFile> {
  const name = asset.fileName ?? asset.uri.split('/').pop() ?? 'upload.jpg';
  // `mimeType` is absent on some Android providers, so fall back to what the
  // asset says it is rather than assuming a photo.
  const type = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');

  // On web the picker returns the DOM `File` alongside the URI; everywhere else
  // this is undefined and the URI is what gets uploaded. See `LocalFile.blob`.
  const original: LocalFile = { uri: asset.uri, name, type, blob: asset.file };

  if (asset.type === 'video' || type.startsWith('video')) return original;

  const small = (asset.fileSize ?? Infinity) < SKIP_BELOW_BYTES;
  const withinBounds = asset.width <= MAX_DIMENSION && asset.height <= MAX_DIMENSION;
  if (small && withinBounds) return original;

  try {
    // Loaded here rather than at the top of the file. `expo-image-manipulator`
    // resolves its native counterpart the moment the module is imported, so in
    // a dev build made before it was added, a top-level import throws while the
    // screen is still mounting and takes the whole screen with it. Down here the
    // same failure is just a photo that goes up unshrunk.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate: a static import runs at module load, where this cannot be caught.
    const manipulator =
      require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    const { ImageManipulator, SaveFormat } = manipulator;

    const context = ImageManipulator.manipulate(asset.uri);

    if (!withinBounds) {
      // One edge only — passing null for the other keeps the aspect ratio, so
      // the longer side is what we clamp.
      context.resize(
        asset.width >= asset.height
          ? { width: MAX_DIMENSION, height: null }
          : { width: null, height: MAX_DIMENSION }
      );
    }

    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: COMPRESS,
    });

    // The output is always JPEG, whatever went in, so the name has to follow —
    // the server reads the extension and the type when it files the upload.
    return {
      uri: result.uri,
      name: name.replace(/\.[^./\\]+$/, '') + '.jpg',
      type: 'image/jpeg',
      blob: await bytesFor(result.uri),
    };
  } catch (caught) {
    // A photo we cannot process is still worth trying to send: the upload may
    // well succeed, and if it does not the error surfaces there instead.
    //
    // Reported rather than swallowed, though. This is the branch that turns a
    // 300KB upload into a 12MB one, and it is otherwise invisible until posts
    // start failing at the transport level with nothing to point at — a build
    // missing `expo-image-manipulator` looks exactly like a flaky connection
    // from the outside, and the two want opposite fixes.
    console.warn(
      '[welle] A photo could not be shrunk and is being sent at its original size. Uploads may ' +
        'fail as a result, and the failure will look like a dropped connection rather than ' +
        'this. On a device this usually means the dev client predates ' +
        '`expo-image-manipulator` and needs rebuilding.',
      caught
    );
    return original;
  }
}
