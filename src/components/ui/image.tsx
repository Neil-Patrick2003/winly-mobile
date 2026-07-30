import { Image as ExpoImage, type ImageLoadEventData } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { withUniwind } from 'uniwind';

import { Colors } from '@/constants/theme';
import { mediaHeaders, resolveMediaUrl } from '@/lib/media';

/**
 * expo-image with `className` support. Uniwind only wires up React Native's
 * own components by default; third-party ones have to be registered.
 */
export const Image = withUniwind(ExpoImage);

/** A bundled `require(…)` is always there; a remote or file URI may not be. */
type PlaceholderSource = { uri?: string | null } | number | null;

/**
 * An image that draws something deliberate when there is nothing to show.
 *
 * Three cases collapse to the same outcome: no source at all, a remote URL that
 * 404s or times out, and a local `file://` the user has since deleted from
 * their library. expo-image leaves a transparent hole for all three, which
 * reads as a broken layout rather than as missing content.
 *
 * `children` replaces the default glyph where there is a better stand-in — a
 * profile falls back to the person's initial.
 */
export function ImageWithPlaceholder({
  source,
  className,
  size,
  contentFit = 'cover',
  icon = { ios: 'photo', android: 'image', web: 'image' },
  iconSize = 22,
  accessibilityLabel,
  onLoad,
  children,
}: {
  source: PlaceholderSource;
  className?: string;
  /**
   * A square box, in points, for the image and its stand-in alike.
   *
   * Worth having as its own prop because the two branches are different
   * elements: the stand-in is a `View` whose child can carry its own size, and
   * the image is an `expo-image` that has none of its own. Sizing only the
   * stand-in — easy to do by accident — leaves anybody who actually has a photo
   * rendering at zero height, which reads as a missing image rather than a
   * missing style.
   */
  size?: number;
  contentFit?: 'cover' | 'contain';
  icon?: SymbolViewProps['name'];
  iconSize?: number;
  accessibilityLabel?: string;
  /**
   * Carries `source.width`/`source.height`. The only way to learn an image's
   * real shape when whoever sent the URL did not say — it never fires for the
   * placeholder, so a caller laying out against it needs a default to start on.
   */
  onLoad?: (event: ImageLoadEventData) => void;
  children?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  // Resolved here rather than at each call site, so every server-supplied image
  // — post media, avatars — reaches the host the app is actually talking to.
  // Local `file://` URIs from the picker pass through unchanged.
  const uri = typeof source === 'number' ? null : resolveMediaUrl(source?.uri);

  // A new source deserves a fresh attempt — otherwise swapping a broken avatar
  // for a working one would go on showing the placeholder.
  useEffect(() => setFailed(false), [uri]);

  if (typeof source !== 'number' && (!uri || failed)) {
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        // A caller-supplied stand-in brings its own fill; the default glyph
        // needs a panel to sit on.
        className={`items-center justify-center ${children ? '' : 'bg-surface-selected'} ${
          className ?? ''
        }`}
        style={size === undefined ? undefined : { width: size, height: size }}>
        {children ?? (
          <SymbolView name={icon} size={iconSize} tintColor={Colors.light.textSecondary} />
        )}
      </View>
    );
  }

  const image = (
    <Image
      source={typeof source === 'number' ? source : { uri: uri!, headers: mediaHeaders(uri) }}
      // Fills the wrapper below when there is one. `h-full w-full` is a class
      // rather than a style for the reason the wrapper exists at all.
      className={size === undefined ? className : `h-full w-full ${className ?? ''}`}
      contentFit={contentFit}
      accessibilityLabel={accessibilityLabel}
      onLoad={onLoad}
      onError={() => setFailed(true)}
    />
  );

  if (size === undefined) return image;

  /*
   * A plain `View` carries the pixel size rather than the image itself.
   *
   * This `Image` is `withUniwind(ExpoImage)`, and that wrapper passes `style`
   * through styleq, which expects compiled class names — a numeric `width`
   * there is an error ("styleq: width typeof 62 is not \"string\" or \"null\"").
   * React Native's own components are wired up differently and take numbers
   * quite happily, so a plain `View` is the way to state an exact size.
   */
  return <View style={{ width: size, height: size }}>{image}</View>;
}
