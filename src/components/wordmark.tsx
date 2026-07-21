import { Text, View } from 'react-native';

/**
 * "Winly" in Plus Jakarta Sans Bold, with a coral tittle (the dot over the i).
 *
 * The word is split so the dot can be drawn as its own view: the `i` renders as
 * U+0131 DOTLESS I and the dot sits on top. The arbitrary values below are
 * derived from the Plus Jakarta Sans Bold outline (unitsPerEm 1000, ascender
 * 1038, descender -222) at 40px/48px:
 *
 *   dotless i  stem x 49–180, advance 228   →  dot left 49 × 0.04 = 1.96px
 *   dotted i   tittle x 61–192, y 605–745   →  131 × 140 units = 5.24 × 5.6px
 *   baseline   (48 - 1260 × 0.04) / 2 + 1038 × 0.04 = 40.32px from top
 *                                            →  dot top 40.32 - 29.8 = 10.52px
 *
 * The tittle is exactly as wide as the stem, so it sits at the stem's x range.
 * If it reads high or low on a device, `top-[10.52px]` is the number to nudge.
 */
const LETTERS = 'text-extrabold text-4xl leading-[48px]';

export function Wordmark() {
  return (
    <View className="flex-row items-baseline">
      <Text className={LETTERS}>W</Text>
      <View>
        {/* U+0131 — dotless i */}
        <Text className={LETTERS}>{'ı'}</Text>
        <View className="absolute left-[1.96px] top-[10.52px] h-[5.6px] w-[5.24px] rounded-full bg-highlight" />
      </View>
      <Text className={LETTERS}>nly</Text>
    </View>
  );
}
