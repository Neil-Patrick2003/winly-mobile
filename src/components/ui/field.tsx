import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, TextInput, type TextInputProps, View } from 'react-native';
import { useResolveClassNames } from 'uniwind';

export type FieldProps = {
  icon: SymbolViewProps['name'];
  invalid?: boolean;
} & TextInputProps;

/**
 * A pill input with a leading icon and no label — the placeholder carries the
 * field name, so `accessibilityLabel` restates it for screen readers, which
 * otherwise lose it the moment the field has a value.
 *
 * Passing `secureTextEntry` also gets you a reveal toggle.
 *
 * `tintColor` and `placeholderTextColor` take raw values rather than classes,
 * so they are resolved from the same token the text uses. Going through
 * `useResolveClassNames` (rather than reading `Colors` directly) keeps them
 * correct under `ScopedTheme` — the auth screens pin themselves to light.
 */
export function Field({ icon, invalid, placeholder, secureTextEntry, ...inputProps }: FieldProps) {
  // Tracked per field, so showing the password does not also unmask the
  // confirmation — retyping it blind is the point of a confirm field.
  const [revealed, setRevealed] = useState(false);
  const muted = useResolveClassNames('text-ink-muted').color;

  return (
    <View
      className={`flex-row items-center gap-3 rounded-2xl border bg-surface-card px-4 py-2.5 ${
        invalid ? 'border-highlight' : 'border-hairline'
      }`}>
      <SymbolView name={icon} size={16} tintColor={muted} />
      <TextInput
        className="flex-1 font-sans text-[15px] text-ink"
        placeholder={placeholder}
        placeholderTextColor={muted}
        accessibilityLabel={placeholder}
        secureTextEntry={secureTextEntry && !revealed}
        {...inputProps}
      />
      {secureTextEntry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={revealed ? `Hide ${placeholder}` : `Show ${placeholder}`}
          onPress={() => setRevealed((value) => !value)}
          hitSlop={8}
          className="active:opacity-60">
          <SymbolView
            name={
              revealed
                ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' }
                : { ios: 'eye', android: 'visibility', web: 'visibility' }
            }
            size={16}
            tintColor={muted}
          />
        </Pressable>
      ) : null}
    </View>
  );
}
