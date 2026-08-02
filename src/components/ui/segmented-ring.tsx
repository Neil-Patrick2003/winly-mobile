import type { ReactNode } from 'react';
import { View } from 'react-native';

/**
 * One dash of the ring: the arc running from `from` degrees, clockwise from
 * twelve o'clock, for `sweep` degrees.
 *
 * Drawn from plain Views, because the project has no SVG dependency and adding
 * one would mean rebuilding the dev client. The technique is the one
 * `ProgressRing` uses: a full ring clipped to its left half, turned by the
 * sweep, and then read through a window over the right half — the intersection
 * of the two is the arc. Wrapping the pair in a rotation of `from` swings that
 * arc round to where it belongs.
 *
 * Only good for a sweep of 180° or less, which is all a three- or four-part
 * ring ever needs. Past that the two halves stop overlapping and the arc breaks
 * up.
 */
function Dash({
  size,
  thickness,
  color,
  from,
  sweep,
}: {
  size: number;
  thickness: number;
  color: string;
  from: number;
  sweep: number;
}) {
  const radius = size / 2;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        transform: [{ rotate: `${from}deg` }],
      }}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: radius,
          width: radius,
          height: size,
          overflow: 'hidden',
        }}>
        <View
          style={{
            position: 'absolute',
            top: 0,
            // Pull the full-size circle back under its window, so the rotation
            // still turns about the ring's own centre.
            left: -radius,
            width: size,
            height: size,
            transform: [{ rotate: `${sweep}deg` }],
          }}>
          <View style={{ width: radius, height: size, overflow: 'hidden' }}>
            <View
              style={{
                width: size,
                height: size,
                borderRadius: radius,
                borderWidth: thickness,
                borderColor: color,
              }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

export type RingSegment = {
  key: string;
  /** The colour it takes once done. */
  color: string;
  done: boolean;
};

/**
 * A ring broken into equal dashes, one per thing being tracked.
 *
 * Reads at a glance in a row: the shape says how many things there are to do,
 * and how much of the outline has colour says how many are done — without
 * anyone having to count or read a number. An untouched segment keeps its place
 * in the muted track colour rather than disappearing, so the ring is the same
 * ring on every day of the week.
 */
export function SegmentedRing({
  segments,
  size = 56,
  thickness = 4,
  track = '#E7EDE4',
  gap = 18,
  children,
}: {
  segments: RingSegment[];
  size?: number;
  thickness?: number;
  /** The colour a segment takes before it is done. */
  track?: string;
  /** Degrees of empty space between one dash and the next. */
  gap?: number;
  children?: ReactNode;
}) {
  const slice = 360 / Math.max(segments.length, 1);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {segments.map((segment, i) => (
        <Dash
          key={segment.key}
          size={size}
          thickness={thickness}
          color={segment.done ? segment.color : track}
          // Half the gap either side, so the space between two dashes is one
          // gap rather than two half-gaps that read as a wider break.
          from={i * slice + gap / 2}
          sweep={slice - gap}
        />
      ))}
      {children}
    </View>
  );
}
