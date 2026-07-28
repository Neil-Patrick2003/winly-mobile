import { SymbolView } from 'expo-symbols';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * A brief confirmation that floats over whatever is on screen.
 *
 * It lives above the navigator on purpose: the thing worth confirming is
 * usually the thing that just closed — sharing a win dismisses the whole entry
 * modal — so a toast owned by that screen would unmount before it could be
 * read.
 *
 * Plain `Animated` rather than Reanimated: this is one opacity and one offset,
 * and the built-in driver needs no worklet or plugin to run it off the JS
 * thread.
 */
type ToastState = { id: number; message: string } | null;

const ToastContext = createContext<((message: string) => void) | null>(null);

/** Long enough to read a short sentence, short enough not to linger. */
const VISIBLE_MS = 2600;
const IN_MS = 220;
const OUT_MS = 180;

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState>(null);
  const progress = useRef(new Animated.Value(0)).current;
  // A counter, not the message: showing the same text twice should replay the
  // animation rather than be treated as no change.
  const nextId = useRef(0);

  const show = useCallback((message: string) => {
    nextId.current += 1;
    setToast({ id: nextId.current, message });
  }, []);

  useEffect(() => {
    if (!toast) return;

    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: IN_MS,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(progress, {
        toValue: 0,
        duration: OUT_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        // A replacement toast arriving mid-fade cancels this animation; tearing
        // the view down then would drop the new message too.
        if (finished) setToast((current) => (current?.id === toast.id ? null : current));
      });
    }, VISIBLE_MS);

    return () => clearTimeout(timer);
  }, [toast, progress]);

  return (
    <ToastContext.Provider value={show}>
      <View className="flex-1">
        {children}

        {toast ? (
          <Animated.View
            // Never in the way of a tap — it is an announcement, not a control.
            pointerEvents="none"
            accessibilityLiveRegion="polite"
            style={{
              position: 'absolute',
              top: insets.top + 8,
              left: 16,
              right: 16,
              alignItems: 'center',
              opacity: progress,
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-14, 0],
                  }),
                },
              ],
            }}>
            <View
              className="flex-row items-center gap-2.5 rounded-full bg-surface-card px-5 py-3"
              style={{ boxShadow: '0 6px 20px rgba(15, 23, 42, 0.16)' }}>
              <SymbolView
                name={{
                  ios: 'checkmark.circle.fill',
                  android: 'check_circle',
                  web: 'check_circle',
                }}
                size={19}
                tintColor="#5FBC88"
              />
              <Text className="font-body-semibold text-[15px] leading-5 text-ink">
                {toast.message}
              </Text>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = use(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
