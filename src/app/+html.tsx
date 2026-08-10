import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * The HTML document every web page is rendered into. Web only — Metro leaves
 * this out of the native bundles entirely.
 *
 * It exists for one line: `ScrollViewStyleReset`. Without it the document has
 * no height, so `html`, `body` and `#root` collapse to the height of their
 * content — and everything built on `flex-1` collapses with them. Two things
 * break at once, and neither looks like a styling problem:
 *
 *   - Lists stop scrolling. A `ScrollView` scrolls what overflows its own box,
 *     and a box with no height never overflows; it just grows.
 *   - The tab bar disappears. It sits below the screen it belongs to, so an
 *     unbounded screen pushes it past the bottom of the window — and `body`
 *     cannot scroll to reach it.
 *
 * The reset is three rules: a full height on the document, `overflow: hidden`
 * on the body so the page itself never scrolls, and `display: flex` on the root
 * so the app fills it. React Native Web documents this as the required setup
 * for any full-screen app.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* `viewport-fit=cover` so the safe-area insets the screens already
            read resolve to real numbers on a notched phone browser.

            `maximum-scale=1, user-scalable=no` pins the zoom. The one that
            actually matters day to day is not pinching but focus: Mobile Safari
            zooms the page in whenever a text field smaller than 16px takes
            focus, and every input in this app is 15px — so signing in or writing
            a comment left the page scaled up and scrolled sideways, with no way
            back but pinching out. Capping the scale is what stops that. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no, viewport-fit=cover"
        />

        {/*
          The rest of the zoom, which the viewport tag alone does not cover.

          `touch-action: manipulation` drops the double-tap-to-zoom gesture, and
          with it the ~300ms the browser waits after every tap to find out
          whether a second one is coming — so this makes the app feel quicker as
          much as it fixes the zoom.

          Mobile Safari has ignored `user-scalable=no` since iOS 10, on purpose,
          so pinch is refused explicitly through its own `gesture*` events. Those
          are WebKit-only and inert everywhere else.
        */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html { touch-action: manipulation; -webkit-text-size-adjust: 100%; }
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              for (const event of ['gesturestart', 'gesturechange', 'gestureend']) {
                document.addEventListener(event, function (e) { e.preventDefault(); }, { passive: false });
              }
            `,
          }}
        />

        {/*
          What makes the export installable.

          Everything referenced here lives in `public/`, which is copied to the
          root of `dist` untouched — so these are absolute paths to real files
          rather than anything Metro has bundled and hashed.
        */}
        <meta
          name="description"
          content="Share your self-care, celebrate small wins, and grow together."
        />
        <link rel="manifest" href="/manifest.json" />
        {/* The green the splash screen and the primary button already wear, so
            the browser chrome matches the app it is framing. */}
        <meta name="theme-color" content="#2E7D56" />

        {/* iOS reads none of the manifest: standalone mode, the home-screen
            icon and the name under it are all still declared with these. */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Welle" />
        <link rel="apple-touch-icon" href="/icons/pwa-192.png" />

        <ScrollViewStyleReset />

        {/*
          Registered from an inline script rather than from the app, because it
          has to happen whether or not the bundle ever finishes loading — the
          offline shell is exactly what a device that cannot fetch the bundle
          needs.

          Guarded on `serviceWorker` being present: it is absent on http:// over
          a LAN address, which is how the dev build is usually reached, and
          absent in a few browsers besides.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').catch(function () {
                    // Nothing to do: the app runs the same, just not offline.
                  });
                });
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
