import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  StatusBar,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type NativeTouchEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImageWithPlaceholder } from '@/components/ui/image';

/**
 * One thing the viewer can show.
 *
 * Deliberately not `Media` from `posts.ts`: an avatar is not a post attachment
 * and has no position or id of its own, so the viewer takes the smaller shape
 * both can satisfy rather than making a profile photo pretend to be a win.
 */
export type LightboxItem = {
  id: string;
  url: string | null;
  kind?: 'image' | 'video';
  /** What a screen reader calls it. */
  label?: string;
};

/** Life size, and as far in as a double tap or a pinch will go. */
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * A pinch may go slightly under life size before springing back.
 *
 * Nothing is drawn smaller than the frame at rest — the release always settles
 * at 1 — but letting the gesture dip below it is what makes pinching out feel
 * like it is resisting rather than like it has stopped responding.
 */
const MIN_SCALE = 0.85;

/** How long a tap waits to find out whether it is half of a double tap. */
const DOUBLE_TAP_MS = 260;

/** Past this, the pager stands down and the finger pans the photo instead. */
const ZOOM_EPSILON = 1.01;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** How far apart two fingers are. */
function spread(touches: NativeTouchEvent[]) {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

type Placement = { scale: number; x: number; y: number };

/**
 * One photo, filling the frame and taking a pinch.
 *
 * Built on React Native's own responder system and `Animated` rather than on
 * gesture-handler and Reanimated worklets. Both are installed, but nothing in
 * this app has ever compiled a worklet — the two places that use Reanimated
 * only ask it for a declarative `FadeIn` — and gesture-handler additionally
 * wants a `GestureHandlerRootView` at the root, which expo-router does not
 * provide. Neither is hard to add, but a photo viewer is not the change worth
 * discovering that on: this runs on iOS, Android and the web with what is
 * already wired up.
 *
 * Zoom state stays on the page rather than being lifted, so paging away from a
 * photo does not flatten it — only whether *something* is zoomed travels up,
 * because the pager has to stand down while a finger is panning.
 */
function ZoomablePage({
  item,
  width,
  height,
  onZoomChange,
  onTap,
}: {
  item: LightboxItem;
  width: number;
  height: number;
  onZoomChange: (zoomed: boolean) => void;
  onTap: () => void;
}) {
  /*
   * Held in state rather than refs, because a ref may not be read while
   * rendering and these are handed straight to a style. The initialiser form
   * means each `Animated.Value` is built once and never replaced — the same
   * reasoning, and the same shape, as the story viewer's progress bar.
   */
  const [scale] = useState(() => new Animated.Value(1));
  const [offsetX] = useState(() => new Animated.Value(0));
  const [offsetY] = useState(() => new Animated.Value(0));

  /*
   * The same three numbers as the `Animated.Value`s above, in plain form.
   *
   * A gesture has to know where it is starting from, and an `Animated.Value`
   * cannot be read synchronously without reaching into its internals. Every
   * write goes through `place` below, so the two cannot drift.
   */
  const now = useRef<Placement>({ scale: 1, x: 0, y: 0 });

  /**
   * Where everything stood when the current touch began.
   *
   * Recorded the moment a finger lands rather than when this view is granted
   * the gesture, because those are not the same instant: a drag is only taken
   * off the pager once it has travelled far enough to prove it is a drag, and
   * measuring from there would throw away the points already covered and make
   * the photo jump under the finger.
   *
   * `spread` is zero for a single finger and the distance between two
   * otherwise, which is what a pinch is measured against.
   */
  const origin = useRef({ x: 0, y: 0, spread: 0, placement: { scale: 1, x: 0, y: 0 } as Placement });

  // Only the boolean is reported upward, and only when it turns over — a pinch
  // writes sixty times a second, and re-rendering the whole viewer that often
  // to say "still zoomed" would cost more than the zoom is worth.
  const announced = useRef(false);

  /**
   * The photo's own proportions, once it has said what they are.
   *
   * Null until then, and the frame's shape stands in — the API sends no
   * dimensions, so `onLoad` is the first moment the real ratio is knowable.
   * It only matters for working out how far a zoomed photo may be dragged.
   */
  const [ratio, setRatio] = useState<number | null>(null);

  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
    },
    []
  );

  /**
   * How far the photo may be dragged in each direction at a given scale.
   *
   * Measured from what is actually drawn, not from the frame: `contain` leaves
   * a letterboxed photo shorter than the screen, and clamping against the
   * screen would let it be dragged until half of it hung off the edge. Zero
   * where the drawn photo still fits, which is what keeps it centred until
   * there is genuinely something out of sight.
   */
  const bounds = useCallback(
    (at: number) => {
      const shape = ratio ?? width / Math.max(height, 1);
      const drawnWidth = Math.min(width, height * shape);
      const drawnHeight = drawnWidth / shape;

      return {
        x: Math.max(0, (drawnWidth * at - width) / 2),
        y: Math.max(0, (drawnHeight * at - height) / 2),
      };
    },
    [ratio, width, height]
  );

  /** Put the photo somewhere, now. */
  const place = useCallback(
    (next: Placement) => {
      now.current = next;
      scale.setValue(next.scale);
      offsetX.setValue(next.x);
      offsetY.setValue(next.y);

      const zoomed = next.scale > ZOOM_EPSILON;
      if (zoomed !== announced.current) {
        announced.current = zoomed;
        onZoomChange(zoomed);
      }
    },
    [scale, offsetX, offsetY, onZoomChange]
  );

  /** Put it somewhere over the next few frames instead. */
  const settle = useCallback(
    (next: Placement) => {
      now.current = next;

      const zoomed = next.scale > ZOOM_EPSILON;
      if (zoomed !== announced.current) {
        announced.current = zoomed;
        onZoomChange(zoomed);
      }

      Animated.parallel(
        [
          [scale, next.scale] as const,
          [offsetX, next.x] as const,
          [offsetY, next.y] as const,
        ].map(([value, toValue]) =>
          Animated.spring(value, {
            toValue,
            friction: 8,
            tension: 90,
            useNativeDriver: true,
          })
        )
      ).start();
    },
    [scale, offsetX, offsetY, onZoomChange]
  );

  /** Settle wherever the gesture left it, back inside what is allowed. */
  const rest = useCallback(() => {
    // Anything at or under life size goes back to life size and centred: a
    // pinch that overshot should not leave the photo adrift in the frame.
    if (now.current.scale <= 1) {
      settle({ scale: 1, x: 0, y: 0 });
      return;
    }

    const limit = bounds(now.current.scale);
    settle({
      scale: now.current.scale,
      x: clamp(now.current.x, -limit.x, limit.x),
      y: clamp(now.current.y, -limit.y, limit.y),
    });
  }, [bounds, settle]);

  /**
   * Take note of where a touch begins, and let it through.
   *
   * Fires for every finger that lands, including a second one joining a drag
   * already under way — which is exactly when a pinch needs re-baselining, so
   * the re-entry is the feature rather than something to guard against.
   *
   * Always answers no. The tap belongs to the `Pressable` inside until a move
   * proves otherwise.
   */
  const noteTouch = (event: GestureResponderEvent) => {
    const { touches } = event.nativeEvent;

    origin.current = {
      x: touches[0]?.pageX ?? 0,
      y: touches[0]?.pageY ?? 0,
      spread: touches.length >= 2 ? spread(touches) : 0,
      placement: now.current,
    };

    return false;
  };

  /**
   * Whether this photo takes the gesture off the pager.
   *
   * Two fingers are always a pinch, and there is nothing else they could be.
   * One finger belongs to the pager until the photo is zoomed in and therefore
   * has somewhere to be moved to — and even then only past a few points of
   * travel, so that a slightly smudged tap still reads as a tap. Without that
   * threshold, double-tapping to zoom back out would be impossible: the first
   * touch's jitter would take the gesture away from the `Pressable`.
   */
  const claimTouch = (event: GestureResponderEvent) => {
    const { touches } = event.nativeEvent;
    if (touches.length >= 2) return true;
    if (now.current.scale <= ZOOM_EPSILON) return false;

    const [touch] = touches;
    if (!touch) return false;

    return (
      Math.abs(touch.pageX - origin.current.x) > 4 || Math.abs(touch.pageY - origin.current.y) > 4
    );
  };

  const moveTouch = (event: GestureResponderEvent) => {
    const { touches } = event.nativeEvent;
    const { placement } = origin.current;

    if (touches.length >= 2) {
      // A second finger that arrived without this view seeing it land — the
      // pager may have held the gesture at the time. Take this frame as the
      // starting point rather than dividing by a spread of zero.
      if (!origin.current.spread) {
        origin.current = {
          ...origin.current,
          spread: spread(touches),
          placement: now.current,
        };
        return;
      }

      const next = clamp(
        placement.scale * (spread(touches) / origin.current.spread),
        MIN_SCALE,
        MAX_SCALE
      );
      const limit = bounds(next);

      place({
        scale: next,
        x: clamp(placement.x, -limit.x, limit.x),
        y: clamp(placement.y, -limit.y, limit.y),
      });
      return;
    }

    const [touch] = touches;
    if (!touch) return;

    const limit = bounds(now.current.scale);
    place({
      scale: now.current.scale,
      x: clamp(placement.x + (touch.pageX - origin.current.x), -limit.x, limit.x),
      y: clamp(placement.y + (touch.pageY - origin.current.y), -limit.y, limit.y),
    });
  };

  /**
   * A tap, which is either a tap or the first half of a double tap.
   *
   * The single tap is held for a moment to find out which — there is no way to
   * know at the time, and firing both would toggle the chrome every time
   * somebody zoomed.
   */
  const tapped = () => {
    const at = Date.now();

    if (at - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = null;

      settle(
        now.current.scale > ZOOM_EPSILON
          ? { scale: 1, x: 0, y: 0 }
          : { scale: DOUBLE_TAP_SCALE, x: 0, y: 0 }
      );
      return;
    }

    lastTap.current = at;
    tapTimer.current = setTimeout(onTap, DOUBLE_TAP_MS);
  };

  return (
    /*
     * React Native's own responder props, rather than a `PanResponder`.
     *
     * `PanResponder` is a wrapper over exactly these, and all it adds here is a
     * `gestureState` this already tracks itself in `origin`. Going without it
     * keeps the gesture out of render — the handlers are event props like any
     * other, where building a responder is a function call made while
     * rendering that reads refs.
     *
     * Capture on both questions, because the `Pressable` below wants the touch
     * for taps: a child that has already been granted the gesture cannot be
     * out-voted on the way back up, so the parent has to be asked first.
     */
    <View
      style={{ width, height }}
      onStartShouldSetResponderCapture={noteTouch}
      onMoveShouldSetResponderCapture={claimTouch}
      onResponderMove={moveTouch}
      onResponderRelease={rest}
      onResponderTerminate={rest}
      // The pager is the only thing that would ask, and it must not be given
      // the gesture mid-pinch.
      onResponderTerminationRequest={() => false}>
      <Pressable
        accessibilityRole="image"
        accessibilityLabel={item.label}
        onPress={tapped}
        style={{ flex: 1 }}>
        {/*
          Translate before scale, which is how both React Native and CSS read
          the list: the element is scaled about its centre and then moved, so a
          translation of ten points moves it ten points on screen whatever the
          zoom. That is the same unit `bounds` is measured in.
        */}
        <Animated.View
          style={{
            flex: 1,
            transform: [{ translateX: offsetX }, { translateY: offsetY }, { scale }],
          }}>
          {item.kind === 'video' ? (
            // Nothing in the app can attach a video any more, so this is for
            // whatever was posted before that changed. Shown as what it is
            // rather than handed to an image loader that will only fail.
            <View className="flex-1 items-center justify-center gap-3">
              <SymbolView
                name={{ ios: 'play.circle.fill', android: 'play_circle', web: 'play_circle' }}
                size={64}
                tintColor="#FFFFFF"
              />
              <Text className="font-sans text-[13px] leading-[18px] text-white/70">
                Videos cannot be played here yet.
              </Text>
            </View>
          ) : (
            <ImageWithPlaceholder
              source={{ uri: item.url }}
              className="h-full w-full"
              contentFit="contain"
              accessibilityLabel={item.label}
              onLoad={({ source }) => {
                if (source.width > 0 && source.height > 0) {
                  setRatio(source.width / source.height);
                }
              }}
            />
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
}

/**
 * Somebody's photos, filling the screen.
 *
 * Opened from anywhere a photo is drawn small — a feed card's tiles, the stack
 * on a post's own page, an avatar. Nothing is cropped here: `contain` is the
 * whole point, since the reason to open a photo full screen is to see the part
 * the tile cut off.
 *
 * Mount it to show it and unmount it to dismiss it, rather than passing a
 * `visible` flag: the index it opens on has to be the tile that was tapped,
 * and a viewer that stayed mounted would need that pushed back into it every
 * time. `items` is read once, on mount, for the same reason.
 */
export function Lightbox({
  items,
  startIndex = 0,
  onClose,
  title,
}: {
  items: LightboxItem[];
  /** Which one was tapped. Clamped, so a stale index cannot open on nothing. */
  startIndex?: number;
  onClose: () => void;
  /** Whose photos these are — drawn in the bar, where there is a name to give. */
  title?: string;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [index, setIndex] = useState(() => clamp(startIndex, 0, Math.max(items.length - 1, 0)));
  const [zoomed, setZoomed] = useState(false);
  // Tapping the photo puts the bar away, so a photo can be looked at with
  // nothing on top of it.
  const [chrome, setChrome] = useState(true);

  const many = items.length > 1;

  return (
    <Modal
      visible
      animationType="fade"
      // Both, so the black runs under the system bars on Android rather than
      // stopping at them — edge-to-edge is on by default from SDK 54.
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onClose}>
      {/*
        React Native's own `StatusBar` rather than expo-status-bar's: this one
        keeps a stack and puts back whatever was set before when it unmounts,
        which is exactly what is wanted for something that opens over the app
        and closes again. The app is otherwise pinned to dark-on-light.
      */}
      <StatusBar barStyle="light-content" />

      <View className="flex-1 bg-black">
        <FlatList
          data={items}
          keyExtractor={(entry) => entry.id}
          horizontal
          pagingEnabled
          // Standing down while a photo is zoomed is what lets one finger pan
          // it — otherwise the pager takes every horizontal drag.
          scrollEnabled={many && !zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={index}
          // Every page is exactly the frame, so the offsets are arithmetic and
          // `initialScrollIndex` does not have to measure anything first.
          getItemLayout={(_, at) => ({ length: width, offset: width * at, index: at })}
          onMomentumScrollEnd={(event) =>
            setIndex(clamp(Math.round(event.nativeEvent.contentOffset.x / width), 0, items.length - 1))
          }
          renderItem={({ item }) => (
            <ZoomablePage
              item={item}
              width={width}
              height={height}
              onZoomChange={setZoomed}
              onTap={() => setChrome((showing) => !showing)}
            />
          )}
        />

        {chrome ? (
          <View
            className="absolute inset-x-0 top-0 flex-row items-center gap-3 px-2 pb-3"
            style={{ paddingTop: insets.top + 6, backgroundColor: 'rgba(0,0,0,0.35)' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={10}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-60">
              <SymbolView
                name={{ ios: 'xmark', android: 'close', web: 'close' }}
                size={18}
                weight="bold"
                tintColor="#FFFFFF"
              />
            </Pressable>

            <Text numberOfLines={1} className="flex-1 font-body-semibold text-[15px] leading-5 text-white">
              {title ?? ''}
            </Text>

            {many ? (
              <Text className="px-2 font-sans text-[13px] leading-[18px] text-white/80">
                {index + 1} of {items.length}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
