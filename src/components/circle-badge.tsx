import { Text, View } from 'react-native';

/**
 * A circle's badge: its initial on the colour picked from its name.
 *
 * Stands in for an avatar. Circles have no picture to upload yet, and a row of
 * identical grey placeholders would be worse than none — the letter and colour
 * together are enough to tell one from another down a list.
 */
export function CircleBadge({
  initial,
  color,
  size = 44,
}: {
  initial: string;
  color: string;
  size?: number;
}) {
  return (
    <View
      className="items-center justify-center rounded-2xl"
      style={{ width: size, height: size, backgroundColor: color }}>
      <Text
        className="font-heading-bold text-white"
        style={{ fontSize: size * 0.42, lineHeight: size * 0.52 }}>
        {(initial.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}
