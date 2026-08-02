import { Text, View } from 'react-native';

/**
 * "welle" in Plus Jakarta Sans Bold, lowercase as the app icon sets it.
 *
 * Nothing is drawn over the letters any more. The old mark spelt "Winly" with a
 * dotless U+0131 so a coral tittle could be positioned over the i by hand, from
 * the face's own outline metrics; this name has no dotted letter, so the trick
 * and the numbers behind it went with it.
 */
const LETTERS = 'text-extrabold text-primary text-4xl leading-[48px]';

export function Wordmark() {
  return (
    <View className="flex-row items-baseline">
      <Text className={LETTERS}>welle</Text>
    </View>
  );
}
