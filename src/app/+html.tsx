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
            read resolve to real numbers on a notched phone browser. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
