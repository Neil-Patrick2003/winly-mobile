import { View } from 'react-native';

import { Image } from '@/components/ui/image';
import { mediaHeaders, resolveMediaUrl } from '@/lib/media';

/**
 * The banner across the top of a profile.
 *
 * The gradient is the base and the photo is laid over it, rather than the two
 * being alternatives. That is what makes the fallback free: expo-image leaves a
 * transparent hole for a cover that 404s or has not loaded yet, and a hole over
 * the gradient is the gradient. Nothing has to track whether the image worked.
 *
 * It is also why removing a cover is safe — `cover_url` goes null server-side
 * and `cover_gradient` is left alone, so the header returns to what it wore
 * before rather than going blank.
 *
 * Shared by both profile screens so a cover cannot look like one thing on your
 * own page and another on somebody else's.
 */
export function ProfileCover({
  uri,
  height,
}: {
  uri: string | null | undefined;
  height: number;
}) {
  // Resolved here because this draws the image itself rather than going through
  // `ImageWithPlaceholder` — whose placeholder is a grey panel, which is not the
  // fallback a cover wants.
  const resolved = resolveMediaUrl(uri);

  return (
    <View
      className="overflow-hidden bg-primary"
      style={{ height }}>
      {resolved ? (
        <Image
          source={{ uri: resolved, headers: mediaHeaders(resolved) }}
          className="h-full w-full"
          contentFit="cover"
          accessibilityLabel="Cover photo"
        />
      ) : null}
    </View>
  );
}
