import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset } from '@/constants/theme';

/**
 * The three pillars of an ESC entry. Order matches the flow the hub launches:
 * Meditation → Learning → Movement.
 */
const PILLARS: {
  key: string;
  title: string;
  description: string;
  icon: SymbolViewProps['name'];
  // A soft tinted chip behind each icon, one per pillar.
  tint: string;
  iconColor: string;
}[] = [
  {
    key: 'meditation',
    title: 'Meditation',
    description: 'Take a few quiet minutes for your mind — guided or on your own.',
    icon: { ios: 'leaf', android: 'self_improvement', web: 'self_improvement' },
    tint: '#DCFCE7',
    iconColor: '#16A34A',
  },
  {
    key: 'learning',
    title: 'Learning',
    description: 'Something you read or figured out, and a moment to reflect on it.',
    icon: { ios: 'book', android: 'menu_book', web: 'menu_book' },
    tint: '#E0F2FE',
    iconColor: '#0284C7',
  },
  {
    key: 'movement',
    title: 'Movement',
    description: 'A walk, a workout, a stretch — however your body moved today.',
    icon: { ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' },
    tint: '#EDE9FE',
    iconColor: '#7C3AED',
  },
];

function PillarCard({ pillar }: { pillar: (typeof PILLARS)[number] }) {
  return (
    <View className="flex-row items-center gap-4 rounded-3xl border border-hairline bg-surface-card p-4">
      <View
        className="h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: pillar.tint }}>
        <SymbolView name={pillar.icon} size={26} tintColor={pillar.iconColor} />
      </View>
      <View className="flex-1">
        <Text className="font-heading-bold text-base leading-6 text-ink">{pillar.title}</Text>
        <Text className="mt-0.5 font-sans text-[13px] leading-[18px] text-ink-muted">
          {pillar.description}
        </Text>
      </View>
    </View>
  );
}

/**
 * The Create hub: what a daily ESC entry is, and the button that starts it.
 * "Get started" opens the Meditation flow; Learning and Movement follow after.
 */
export default function CreateHubScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-surface">
      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center px-6"
        contentContainerStyle={{ paddingTop: 12, paddingBottom: BottomTabInset + insets.bottom + 24 }}>
        <View className="gap-1 pb-2">
          <Text className="font-heading-bold text-[28px] leading-9 text-ink">
            Share your daily ESC
          </Text>
          <Text className="font-sans text-[15px] leading-[22px] text-ink-muted">
            One small entry across three parts of a balanced day. Do as much or as
            little as you like.
          </Text>
        </View>

        <View className="gap-3 pt-4">
          {PILLARS.map((pillar) => (
            <PillarCard key={pillar.key} pillar={pillar} />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/entry/meditation')}
          className="mt-8 items-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500 py-4 active:opacity-85"
          style={{ boxShadow: '0 8px 20px rgba(34, 197, 94, 0.35)' }}>
          <Text className="font-body-semibold text-base leading-6 text-white">Get started</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
