import { View } from 'react-native';

/**
 * A leaf, drawn rather than typed.
 *
 * The same reason the flower before it was drawn, and the heart before that:
 * Plus Jakarta Sans has no leaf glyph, and the emoji fallback ignores colour —
 * 🍃 would arrive in whatever hue the platform ships, which is never the brand
 * green. Built from a box instead, so it sits exactly on the palette.
 *
 * The shape is one square with two opposite corners fully rounded and the other
 * two left square. That is the whole trick: rounding all four gives a circle,
 * and rounding just the one pair gives the two points and two curved edges a
 * leaf actually has. The 45° turn is what stands it upright.
 *
 * No midrib. At this size a vein is a smudge rather than a detail, and drawing
 * one means a second box rotated against the first — cost with nothing to show
 * for it.
 */
const SIZE = 11;

export function Leaf({
  /** Degrees to lean, on top of the 45° that makes the shape a leaf at all. */
  tilt = 0,
  /** The fill, so a pair can be two greens rather than one repeated. */
  className = 'bg-primary',
}: {
  tilt?: number;
  className?: string;
}) {
  return (
    <View
      className={className}
      style={{
        width: SIZE,
        height: SIZE,
        borderTopLeftRadius: SIZE,
        borderBottomRightRadius: SIZE,
        transform: [{ rotate: `${45 + tilt}deg` }],
      }}
    />
  );
}

/**
 * A rule — leaves — rule ornament.
 *
 * Two rather than one, leaning apart like a sprig: a single leaf at this size
 * reads as a stray shape, while the pair says growing without needing a stem
 * drawn between them. The second takes the secondary green so the two read as
 * two leaves rather than one shape printed twice.
 */
export function LeafDivider() {
  return (
    <View className="flex-row items-center justify-center gap-1">
      <View className="h-[1.5px] w-8 rounded-sm bg-hairline" />
      <View className="flex-row items-center gap-[3px]">
        <Leaf tilt={-18} />
        <Leaf tilt={18} className="bg-secondary" />
      </View>
      <View className="h-[1.5px] w-8 rounded-sm bg-hairline" />
    </View>
  );
}
