import { Text } from 'react-native';

/** Enough of a circle to name it. */
export type NameableCircle = {
  name: string;
  parent?: { id: string; name: string } | null;
};

/**
 * A circle's name, carrying the circle it sits inside — "finance (meta)".
 *
 * One place, because the same circle has to read the same everywhere it is
 * named: a list, a chip on a post, the header of its own screen. Two circles
 * called "finance" under different parents are otherwise two rows nothing can
 * tell apart.
 *
 * The parent is drawn in the muted colour rather than as part of the name — it
 * says where the circle lives, and reading it at the same weight would make
 * every name look twice as long as it is.
 */
export function CircleName({
  circle,
  className = '',
  parentClassName = 'font-sans text-ink-muted',
  numberOfLines,
}: {
  circle: NameableCircle;
  className?: string;
  /** Overridden where the surface behind it is not the page. */
  parentClassName?: string;
  numberOfLines?: number;
}) {
  return (
    <Text numberOfLines={numberOfLines} className={className}>
      {circle.name}
      {circle.parent ? <Text className={parentClassName}> ({circle.parent.name})</Text> : null}
    </Text>
  );
}

/**
 * The same thing as a plain string, for the places that cannot take markup —
 * an accessibility label, a toast, the title of a confirmation.
 */
export function circleLabel(circle: NameableCircle): string {
  return circle.parent ? `${circle.name} (${circle.parent.name})` : circle.name;
}
