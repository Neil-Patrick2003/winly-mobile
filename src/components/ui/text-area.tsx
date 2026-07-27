import { TextInput, type TextInputProps } from 'react-native';
import { useResolveClassNames } from 'uniwind';

/**
 * Multi-line counterpart to `Field`. No leading icon — the section heading
 * above already names it — and a fixed minimum height so an empty box still
 * looks like somewhere to write.
 */
export function TextArea({ placeholder, ...props }: TextInputProps) {
  const muted = useResolveClassNames('text-ink-muted').color;

  return (
    <TextInput
      multiline
      textAlignVertical="top"
      placeholder={placeholder}
      placeholderTextColor={muted}
      accessibilityLabel={placeholder}
      className="min-h-24 rounded-2xl border border-hairline bg-surface-card px-4 py-3 font-sans text-[15px] text-ink"
      {...props}
    />
  );
}
