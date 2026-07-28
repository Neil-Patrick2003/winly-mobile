import type { ReactNode } from 'react';
import { View } from 'react-native';

/**
 * A circular progress arc drawn from plain Views — the project has no SVG
 * dependency, and adding one would mean rebuilding the dev client.
 *
 * A full ring is rotationally symmetric, so rotating one does nothing on its
 * own; it is the *clipping* that draws the arc. Two windows do the work — the
 * right half carries the first 180° of the sweep, the left half the remainder —
 * each holding a half-ring rotated to where the sweep should end.
 *
 * This is the seam to swap for `react-native-svg` if the arcs ever need to
 * animate, or if nested `overflow: hidden` under a transform proves unreliable
 * on Android, which is its known weak spot.
 */
export function ProgressRing({
  progress,
  color,
  size = 64,
  thickness = 5,
  track = '#EAEDF3',
  children,
}: {
  /** 0–1. Values outside the range are clamped rather than wrapping. */
  progress: number;
  color: string;
  size?: number;
  thickness?: number;
  track?: string;
  children?: ReactNode;
}) {
  const radius = size / 2;
  const degrees = Math.min(1, Math.max(0, progress)) * 360;

  const arc = (side: 'left' | 'right', rotate: number) => (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: side === 'right' ? radius : 0,
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
          left: side === 'right' ? -radius : 0,
          width: size,
          height: size,
          transform: [{ rotate: `${rotate}deg` }],
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
  );

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: radius,
          borderWidth: thickness,
          borderColor: track,
        }}
      />
      {arc('right', Math.min(degrees, 180))}
      {degrees > 180 ? arc('left', degrees) : null}
      {children}
    </View>
  );
}
