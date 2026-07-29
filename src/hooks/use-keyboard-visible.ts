import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Whether the soft keyboard is on screen.
 *
 * For the one thing layout cannot work out on its own: a bar pinned to the
 * bottom pads itself by the safe-area inset to clear the home indicator, and
 * once the keyboard is up that inset is covered by the keyboard — the padding
 * becomes a gap under the bar rather than space for the gesture area.
 *
 * iOS reports `Will` events, which fire in step with the keyboard's animation
 * and so keep the layout in time with it. Android only reliably fires the `Did`
 * pair.
 */
export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setVisible(true)
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setVisible(false)
    );

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
