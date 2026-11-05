import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { openLegalPage, PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/legal';
import { goBack } from '@/lib/navigation';

/**
 * Reached from the header. Most preferences are not built yet; what is here
 * is the account deletion both app stores require to be findable in-app.
 */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-surface" style={{ paddingTop: insets.top }}>
      <View className="w-full max-w-[800px] flex-1 self-center px-4">
        <View className="flex-row items-center gap-2 pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => goBack()}
            hitSlop={8}
            className="-ml-2 p-2 active:opacity-60">
            <SymbolView
              name={{
                ios: 'chevron.left',
                android: 'arrow_back',
                web: 'arrow_back',
              }}
              size={18}
              tintColor={Colors.light.text}
            />
          </Pressable>
          <Text className="font-heading-bold text-xl leading-7 text-ink">Settings</Text>
        </View>

        <Text className="pt-6 font-body-semibold text-xs uppercase leading-4 tracking-wider text-ink-muted">
          Account
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/delete-account')}
          className="mt-2 flex-row items-center gap-3 rounded-lg bg-surface-card p-4 active:opacity-70">
          <SymbolView
            name={{ ios: 'trash', android: 'delete', web: 'delete' }}
            size={17}
            tintColor="#DC2626"
          />
          <Text
            className="flex-1 font-body-semibold text-[15px] leading-5"
            style={{ color: '#DC2626' }}>
            Delete account
          </Text>
          <SymbolView
            name={{
              ios: 'chevron.right',
              android: 'chevron_right',
              web: 'chevron_right',
            }}
            size={14}
            tintColor={Colors.light.textSecondary}
          />
        </Pressable>

        <Text className="pt-6 font-body-semibold text-xs uppercase leading-4 tracking-wider text-ink-muted">
          Legal
        </Text>
        <View className="mt-2 overflow-hidden rounded-lg bg-surface-card">
          <Pressable
            accessibilityRole="link"
            onPress={() => openLegalPage(PRIVACY_POLICY_URL)}
            className="flex-row items-center gap-3 p-4 active:opacity-70">
            <SymbolView
              name={{
                ios: 'hand.raised',
                android: 'privacy_tip',
                web: 'privacy_tip',
              }}
              size={17}
              tintColor={Colors.light.textSecondary}
            />
            <Text className="flex-1 font-body-semibold text-[15px] leading-5 text-ink">
              Privacy Policy
            </Text>
            <SymbolView
              name={{
                ios: 'arrow.up.right',
                android: 'open_in_new',
                web: 'open_in_new',
              }}
              size={14}
              tintColor={Colors.light.textSecondary}
            />
          </Pressable>
          <View className="mx-4 h-px bg-hairline" />
          <Pressable
            accessibilityRole="link"
            onPress={() => openLegalPage(TERMS_URL)}
            className="flex-row items-center gap-3 p-4 active:opacity-70">
            <SymbolView
              name={{
                ios: 'doc.text',
                android: 'description',
                web: 'description',
              }}
              size={17}
              tintColor={Colors.light.textSecondary}
            />
            <Text className="flex-1 font-body-semibold text-[15px] leading-5 text-ink">
              Terms of Service
            </Text>
            <SymbolView
              name={{
                ios: 'arrow.up.right',
                android: 'open_in_new',
                web: 'open_in_new',
              }}
              size={14}
              tintColor={Colors.light.textSecondary}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
