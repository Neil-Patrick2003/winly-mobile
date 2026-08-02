import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Brand } from '@/constants/theme';

const INITIAL_SCALE_FACTOR = Dimensions.get('screen').height / 90;

/**
 * How long the whole reveal takes, in milliseconds.
 *
 * Long enough to read as deliberate, short enough that somebody opening the app
 * to log a two-minute win is not made to watch it.
 */
const DURATION = 1100;

/**
 * The colour the splash wears.
 *
 * One flat green rather than the sweep it used to be: the palette carries the
 * brand now, and a gradient over it only says the same thing twice.
 */
const BRAND_GROUND = Brand.primary;

/**
 * What covers the app while it boots, and how it gets out of the way.
 *
 * Two animations run together rather than one. The mark rushes toward the
 * viewer while the colour behind it fades, so the splash reads as being passed
 * through rather than switched off — the welcome screen is already mounted
 * underneath and is simply uncovered.
 *
 * The static branch is what the native splash hands over to: same colour, same
 * mark, same size, so nothing jumps at the seam. Only once it has laid out is
 * the native splash hidden, which is what stops a white frame appearing
 * between the two.
 */
export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  // Held back until the colour has had a moment on screen, then thrown at
  // the viewer. The pause is what keeps it from looking like a glitch.
  const markKeyframe = new Keyframe({
    0: { transform: [{ scale: 1 }], opacity: 1 },
    45: { transform: [{ scale: 1 }], opacity: 1 },
    58: {
      // A breath inward, so the zoom has something to spring from.
      transform: [{ scale: 0.92 }],
      opacity: 1,
      easing: Easing.out(Easing.quad),
    },
    100: {
      transform: [{ scale: 9 }],
      opacity: 0,
      easing: Easing.in(Easing.cubic),
    },
  });

  // Fades late, so the mark is already moving before the colour goes.
  const groundKeyframe = new Keyframe({
    0: { opacity: 1 },
    62: { opacity: 1 },
    100: { opacity: 0, easing: Easing.in(Easing.quad) },
  });

  const mark = <Image style={styles.brandMark} source={require('@/assets/images/brand/welle_logo.png')} />;

  return animate ? (
    <Animated.View
      entering={groundKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.brandOverlay}>
      <Animated.View entering={markKeyframe.duration(DURATION)}>{mark}</Animated.View>
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      style={styles.brandOverlay}>
      {mark}
    </View>
  );
}

/*
 * The three below belong to `AnimatedIcon`, the welcome screen's own mark.
 * Untouched — only the splash overlay above was rebranded.
 */
const keyframe = new Keyframe({
  0: {
    transform: [{ scale: INITIAL_SCALE_FACTOR }],
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const logoKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
  },
  40: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
    easing: Easing.elastic(0.7),
  },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '0deg' }],
  },
  100: {
    transform: [{ rotateZ: '7200deg' }],
  },
});

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Animated.View entering={glowKeyframe.duration(60 * 1000 * 4)} style={styles.glow}>
        <Image style={styles.glow} source={require('@/assets/images/logo-glow.png')} />
      </Animated.View>

      <Animated.View entering={keyframe.duration(DURATION)} style={styles.background} />
      <Animated.View style={styles.imageContainer} entering={logoKeyframe.duration(DURATION)}>
        <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    width: 201,
    height: 201,
    position: 'absolute',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
    zIndex: 100,
  },
  image: {
    width: 76,
    height: 71,
  },
  background: {
    borderRadius: 40,
    backgroundColor: Brand.accent,
    width: 128,
    height: 128,
    position: 'absolute',
  },
  brandMark: {
    width: 132,
    height: 132,
  },
  brandOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BRAND_GROUND,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
