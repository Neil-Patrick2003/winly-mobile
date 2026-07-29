import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryHeader, NAVY, PILLAR_THEME } from '@/components/entry-chrome';
import { Image } from '@/components/ui/image';
import { PILLAR_ORDER, type Pillar } from '@/lib/entry-draft';

/** What each pillar asks for, in the shortest form that still lands. */
const BLURB: Record<Pillar, string> = {
  meditation: 'Pick a guide or sit in silence',
  learning: 'One thing that stuck with you today',
  movement: 'However you moved your body',
};

/**
 * The flow's front door: what a small win is, and the three parts it can be
 * made of. Nothing here is a choice — the steps are walked in order and any of
 * them can be skipped, so this is orientation rather than a menu.
 */
export default function EntryIntroScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-surface-card">
      <EntryHeader />

      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center px-4"
        contentContainerStyle={{ paddingTop: 28, paddingBottom: insets.bottom + 24 }}>
        <View className="items-center gap-3">
          <Image
            source={require('@/assets/images/brand/logo.png')}
            className="h-[104px] w-[104px]"
            contentFit="contain"
          />
          <Text className="text-center font-heading-bold text-[26px] leading-9 text-ink">
            Let&rsquo;s capture today&rsquo;s self-care
          </Text>
          <Text className="text-center font-sans text-[15px] leading-[22px] text-ink-muted">
            A small win has three parts. Do one, two, or all three — whatever fits today.
          </Text>
        </View>

        <View className="gap-3 pt-7">
          {PILLAR_ORDER.map((pillar) => {
            const theme = PILLAR_THEME[pillar];
            return (
              <View
                key={pillar}
                className="flex-row items-center gap-3.5 rounded-2xl p-4"
                style={{ backgroundColor: theme.panel }}>
                <View
                  className="h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: theme.tint }}>
                  <SymbolView name={theme.icon} size={24} tintColor={theme.accent} />
                </View>
                <View className="flex-1">
                  <Text className="font-heading-bold text-base leading-6 text-ink">
                    {theme.label}
                  </Text>
                  <Text className="mt-0.5 font-sans text-sm leading-5 text-ink-muted">
                    {BLURB[pillar]}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/entry/meditation')}
          className="mt-8 items-center rounded-full py-4 active:opacity-85"
          style={{ backgroundColor: NAVY }}>
          <Text className="font-body-semibold text-base leading-6 text-white">
            Let&rsquo;s go
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
