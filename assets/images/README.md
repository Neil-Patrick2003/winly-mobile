# Images

Drop image files here. They are bundled at build time, so anything you add is
available offline and never 404s.

## Where things go

| Folder           | What belongs in it                                          |
| ---------------- | ----------------------------------------------------------- |
| `brand/`         | Logo, wordmark, splash art — anything identity-bearing       |
| `illustrations/` | Empty states, onboarding art, decorative graphics            |
| `content/`       | Photos and screenshots used inside screens                   |
| `tabIcons/`      | Tab bar icons (already wired up in `src/components/app-tabs`) |

The remaining loose files at the top level (`icon.png`, `splash-icon.png`,
`favicon.png`, `android-icon-*.png`) are referenced by `app.json` and must keep
their current names and paths.

## Using an image

Import through the `@/assets` alias — never a relative `../../` path:

```tsx
import { Image } from 'expo-image';

<Image source={require('@/assets/images/brand/logo.png')} style={{ width: 120, height: 32 }} />;
```

`require` needs a literal string. `require('@/assets/images/' + name)` will not
work — the bundler resolves these at build time. For a dynamic set, build a
lookup object that maps each key to its own literal `require`.

Prefer `expo-image` over React Native's `Image`: it caches to disk, decodes off
the main thread, and supports `contentFit`, blurhash placeholders, and
transitions.

## File formats and sizes

- **PNG** for logos, icons, anything with transparency.
- **JPG** for photos — far smaller than PNG at the same perceived quality.
- **SVG** only via `react-native-svg` (not installed). For flat brand marks a
  `@3x` PNG is usually the lower-friction choice.
- **WebP** works on Android and iOS 14+, and is worth it for large photos.

## Density suffixes

Ship three sizes and Metro picks the right one per device — you `require` only
the base name:

```
logo.png      ← 1x, the size you use in layout (e.g. 120×32)
logo@2x.png   ← 240×64
logo@3x.png   ← 360×96
```

`@3x` covers every modern phone. If you only ship one file, export it at `@3x`
dimensions and constrain it with `style` so it downsamples cleanly rather than
blurring.

## Two-scheme images

A logo drawn in `#0F172A` disappears on the dark background. Export both and
switch on the scheme:

```tsx
import { useColorScheme } from '@/hooks/use-color-scheme';

const scheme = useColorScheme();
const logo =
  scheme === 'dark'
    ? require('@/assets/images/brand/logo-dark.png')
    : require('@/assets/images/brand/logo-light.png');
```

## Remote images

No file needed — pass the URL straight to `expo-image`:

```tsx
<Image source={{ uri: 'https://…' }} placeholder={{ blurhash }} transition={200} />
```
