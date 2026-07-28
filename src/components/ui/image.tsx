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
  contentFit = 'cover',
  icon = { ios: 'photo', android: 'image', web: 'image' },
  iconSize = 22,
  accessibilityLabel,
  onLoad,
  children,
}: {
  source: PlaceholderSource;
  className?: string;
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
        }`}>
        {children ?? (
          <SymbolView name={icon} size={iconSize} tintColor={Colors.light.textSecondary} />
        )}
      </View>
    );
  }

  return (
    <Image
      source={typeof source === 'number' ? source : { uri: uri!, headers: mediaHeaders(uri) }}
      className={className}
      contentFit={contentFit}
      accessibilityLabel={accessibilityLabel}
      onLoad={onLoad}
      onError={() => setFailed(true)}
    />
  );
}
