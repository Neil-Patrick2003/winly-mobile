import { View } from 'react-native';

/**
 * A heart built from two rounded halves rotated 45°. Plus Jakarta Sans has no
 * ♥ glyph (U+2665 maps to .notdef) and the emoji fallback ignores colour, so
 * the shape is drawn instead — that keeps it exactly on the brand coral.
 *
 * `transformOrigin` has no Tailwind equivalent that maps onto React Native, so
 * the two rotations stay inline.
 */
const LOBE = 'absolute top-0 h-[11.2px] w-[7px] rounded-t-full bg-highlight';

export function Heart() {
  return (
    <View className="h-[12.6px] w-[14px]">
      <View
        className={`${LOBE} left-0`}
        style={{ transformOrigin: '100% 100%', transform: [{ rotate: '45deg' }] }}
      />
      <View
        className={`${LOBE} left-[7px]`}
        style={{ transformOrigin: '0% 100%', transform: [{ rotate: '-45deg' }] }}
      />
    </View>
  );
}

/** A rule — heart — rule ornament. */
export function HeartDivider() {
  return (
    <View className="flex-row items-center justify-center gap-1">
      <View className="h-[1.5px] w-8 rounded-sm bg-hairline" />
      <Heart />
      <View className="h-[1.5px] w-8 rounded-sm bg-hairline" />
    </View>
  );
}
