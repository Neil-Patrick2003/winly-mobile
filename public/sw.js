/*
 * Winly's service worker: the least a browser needs to treat the export as an
 * installable app, and deliberately no more.
 *
 * Expo warns about service workers for a real reason — a worker that serves the
 * app from its cache first will keep serving a build long after a new one has
 * shipped, and unlike a native app there is no store update to clear it. So the
 * one rule here is that the network wins wherever the answer could have
 * changed. The cache is a fallback for being offline, not the primary source.
 *
 * What that means in practice:
 *
 *   - Navigations go to the network first, so an open tab picks up a deploy on
 *     its next load. The cached shell is only reached for when the network
 *     fails outright.
 *   - Bundles and images under /_expo/ are content-hashed: a new build gives
 *     them new filenames, so serving them from cache can never be stale, and
 *     they are the assets worth having offline.
 *   - Everything else — above all the API — is left alone entirely. Caching a
 *     feed or a token response is how one person's timeline ends up in front of
 *     the next person who signs in on the same browser.
 *
 * Bumping CACHE drops every cache that came before it, which is the manual
 * escape hatch if a release ever does get stuck.
 */
const CACHE = 'winly-v1';

/** The shell to fall back to when a navigation cannot reach the network. */
const OFFLINE_URLS = ['/'];

self.addEventListener('install', (event) => {
  // Take over as soon as this worker is ready rather than waiting for every tab
  // to close — a user who reloads to get a fix should get it on that reload.
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_URLS)).catch(() => {
      // A failed pre-cache must not fail the install: the worker is still
      // useful, it simply has no offline shell until the first successful load.
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })()
  );
});

/** Whether this is a request for a content-hashed build artefact. */
function isBuildAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/_expo/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only ever GET. A POST is somebody doing something, and replaying one from a
  // cache would be a bug with consequences.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Anything on another origin — the API, avatars, uploaded photos — is the
  // server's business and is passed straight through.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          // Keep the shell current so the offline fallback is the last build
          // that actually loaded, not the one installed months ago.
          const cache = await caches.open(CACHE);
          cache.put('/', response.clone());
          return response;
        } catch {
          return (await caches.match('/')) ?? Response.error();
        }
      })()
    );
    return;
  }

  if (isBuildAsset(url)) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(request);
        if (hit) return hit;

        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })()
    );
  }
});
