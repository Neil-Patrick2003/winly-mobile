import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors } from '@/constants/theme';

export type CodeInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  /** How many digits the code has. */
  length?: number;
  invalid?: boolean;
  autoFocus?: boolean;
  /** Fired once the last box is filled — usually to move focus onward. */
  onFilled?: (value: string) => void;
};

/**
 * A one-digit-per-box code field.
 *
 * Six boxes, but one `TextInput` — laid transparently over the whole row rather
 * than one input per box. Six real inputs is the obvious build and the wrong
 * one: the OS fills a one-time code by writing the whole string into a single
 * field, so splitting it across six leaves autofill putting all six digits in
 * the first box. Pasting breaks the same way, and backspace across a boundary
 * has to be simulated with key handlers that behave differently on each
 * platform. One input keeps autofill, paste, select-all and backspace as the
 * system already implements them; the boxes are only what it looks like.
 *
 * The digits are drawn from `value`, so this stays a controlled component and
 * the parent remains the only thing holding the code.
 */
export function CodeInput({
  value,
  onChangeText,
  length = 6,
  invalid,
  autoFocus,
  onFilled,
}: CodeInputProps) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  // The box the next digit lands in. Clamped, because once the code is full
  // there is no next box and the last one should stay lit rather than the
  // highlight falling off the end.
  const activeIndex = Math.min(value.length, length - 1);

  const handleChange = (next: string) => {
    // Digits only. The keyboard is numeric but a paste is not, and a code
    // pasted with a stray space would fail the server's `digits:6` for a
    // reason nobody could see on screen.
    const digits = next.replace(/\D/g, '').slice(0, length);
    onChangeText(digits);

    if (digits.length === length) onFilled?.(digits);
  };

  return (
    <Pressable
      // The boxes are decoration; this is what puts the caret in the field.
      accessibilityRole="none"
      onPress={() => input.current?.focus()}>
      <View className="flex-row gap-2">
        {Array.from({ length }, (_, index) => {
          const digit = value[index];
          const isActive = focused && index === activeIndex;

          return (
            <View
              key={index}
              className={`h-14 flex-1 items-center justify-center rounded-2xl border bg-surface-card ${
                isActive || invalid ? '' : 'border-hairline'
              }`}
              style={
                invalid
                  ? { borderColor: Colors.light.highlight }
                  : isActive
                    ? {
                        borderColor: Colors.light.primary,
                        // Doubles as the focus ring. A border alone at this size
                        // reads as barely different from the resting state.
                        boxShadow: '0 0 0 3px rgba(46, 125, 86, 0.15)',
                      }
                    : undefined
              }>
              <Text className="font-heading-bold text-2xl leading-7 text-ink">{digit ?? ''}</Text>
            </View>
          );
        })}
      </View>

      {/*
        Invisible rather than hidden: it has to stay in the layout and stay
        focusable, so it is laid over the boxes at zero opacity. `caretHidden`
        because the real caret would sit wherever the invisible text does,
        which is not where the highlighted box is.
      */}
      <TextInput
        ref={input}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        maxLength={length}
        keyboardType="number-pad"
        inputMode="numeric"
        // What lets iOS offer the code from the email above the keyboard.
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        caretHidden
        accessibilityLabel={`${length}-digit code`}
        style={[StyleSheet.absoluteFill, { opacity: 0 }]}
      />
    </Pressable>
  );
}
