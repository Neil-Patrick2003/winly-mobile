import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { LayoutAnimation, Platform, Pressable, Text, UIManager, View } from 'react-native';

import { Colors } from '@/constants/theme';

// LayoutAnimation needs a one-time opt-in on old-arch Android. Harmless on the
// new architecture and on iOS, where the flag is ignored.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * A single expandable row — used for the "new to meditation?" FAQ and as the
 * shell of each meditation category. The chevron rotates and the body height
 * animates open. `defaultOpen` seeds the first render (the FAQ opens itself so
 * the answer is visible without a tap).
 */
export function Accordion({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };

  return (
    <View className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-70">
        <View className="flex-1">
          <Text className="font-heading-bold text-[15px] leading-5 text-ink">{title}</Text>
          {subtitle ? (
            <Text className="mt-0.5 font-sans text-[13px] leading-4 text-ink-muted">{subtitle}</Text>
          ) : null}
        </View>
        <SymbolView
          name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
          size={16}
          weight="semibold"
          tintColor={Colors.light.textSecondary}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </Pressable>
      {open ? <View className="px-4 pb-4">{children}</View> : null}
    </View>
  );
}
