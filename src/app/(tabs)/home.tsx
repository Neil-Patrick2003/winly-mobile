import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeartDivider } from '@/components/heart';
import { Wordmark } from '@/components/wordmark';
import { BottomTabInset } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

/**
 * Time-of-day greeting, on the device's local clock.
 *
 * The small hours are handled explicitly: midnight to 05:00 is technically am,
 * but "Good morning" at 2am reads wrong.
 */
function greetingFor(hour: number) {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good night';
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Only the given name — the full display name reads oddly in a greeting.
  const firstName = user?.name.trim().split(' ')[0];
  const greeting = greetingFor(new Date().getHours());

  return (
    <View className="flex-1 bg-surface">
      <ScrollView
        contentContainerClassName="w-full max-w-[800px] self-center px-6"
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: BottomTabInset + insets.bottom + 24,
        }}>

        <View className="gap-1">
          <Text className="font-heading-bold text-2xl leading-8 text-ink">
            {firstName ? `${greeting}, ${firstName}` : greeting}
          </Text>
          <Text className="font-sans text-sm leading-5 text-ink-muted">
            Your feed lives here. Follow a few people, or share the first win yourself.
          </Text>
        </View>

        <View className="mt-6 items-center gap-2 rounded-2xl border border-hairline bg-surface-card px-6 py-10">
          <Text className="text-center font-body-semibold text-base leading-6 text-ink">
            Nothing in your feed yet
          </Text>
          <Text className="text-center font-sans text-sm leading-5 text-ink-muted">
            Tap the button in the middle of the tab bar to post something you are proud of.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
