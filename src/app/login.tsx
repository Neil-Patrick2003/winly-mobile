import { Link, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeartDivider } from '@/components/heart';
import { Field } from '@/components/ui/field';
import { Wordmark } from '@/components/wordmark';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * Sign-in. Pinned to the light palette so arriving from the welcome screen —
 * which commits to light because its artwork is fixed light — does not flash a
 * dark screen on a dark-scheme device.
 *
 * Submits to `POST /api/v1/login`, which returns a Sanctum token for this
 * device. Each successful call mints an additional token — it does not replace
 * the one issued at sign-up.
 */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Seconds left on a 429 rate limit; the button stays disabled until zero. */
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const emailInvalid = email.trim().length > 0 && !emailValid;

  // Sign-in checks the address is well formed and that a password was typed,
  // nothing more. Strength rules belong on sign-up — applying them here would
  // lock out anyone whose existing password predates the current rule.
  const formValid = emailValid && password.length > 0;
  const canSubmit = formValid && !submitting && cooldown === 0;

  const edit = (setValue: (value: string) => void) => (value: string) => {
    setValue(value);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      await login({ email, password });
      router.replace('/(tabs)/home');
    } catch (caught) {
      if (caught instanceof ApiError) {
        // Wrong password, unknown email and deleted account all arrive as the
        // same message under `email`. Showing it verbatim is the point — do not
        // try to narrow it down.
        setError(caught.fieldErrors.email ?? caught.message);
        if (caught.retryAfterSeconds) setCooldown(caught.retryAfterSeconds);
      } else {
        setError(
          caught instanceof Error ? caught.message : 'Something went wrong. Please try again.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-surface">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="w-full max-w-[800px] grow self-center px-6"
          contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            className="-ml-2 mt-2 self-start p-2 active:opacity-60">
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              size={18}
              tintColor={Colors.light.text}
            />
          </Pressable>

          <View className="items-center gap-2 pt-4">
            <Wordmark />
            <HeartDivider />
          </View>

          <View className="gap-1 pt-6">
            <Text className="font-heading-bold text-2xl leading-8 text-ink">Welcome back</Text>
            <Text className="font-sans text-sm leading-5 text-ink-muted">
              Pick up where you left off and keep the streak going.
            </Text>
          </View>

          <View className="gap-2.5 pt-6">
            {/* Email only — the API does not accept a username here. */}
            <Field
              icon={{ ios: 'envelope', android: 'mail', web: 'mail' }}
              placeholder="Email address"
              value={email}
              onChangeText={edit(setEmail)}
              invalid={emailInvalid || Boolean(error)}
              maxLength={255}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
            />
            <Field
              icon={{ ios: 'lock', android: 'lock', web: 'lock' }}
              placeholder="Password"
              value={password}
              onChangeText={edit(setPassword)}
              invalid={Boolean(error)}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />

            {error || emailInvalid ? (
              <Text className="px-4 font-sans text-xs leading-4 text-highlight">
                {error ?? 'Enter a valid email address.'}
              </Text>
            ) : null}
          </View>

          <View className="gap-3 pt-8">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
              disabled={!canSubmit}
              onPress={handleSubmit}
              className={`items-center rounded-full bg-linear-to-r from-green-500 via-blue-500 to-violet-500 py-3.5 active:opacity-85 ${
                canSubmit ? '' : 'opacity-40'
              }`}
              style={canSubmit ? { boxShadow: '0 8px 20px rgba(34, 197, 94, 0.35)' } : undefined}>
              <View className="flex-row items-center gap-2">
                {submitting ? <ActivityIndicator size="small" color="#ffffff" /> : null}
                <Text className="font-body-semibold text-base leading-6 text-white">
                  {submitting
                    ? 'Logging in…'
                    : cooldown > 0
                      ? `Try again in ${cooldown}s`
                      : 'Log In'}
                </Text>
              </View>
            </Pressable>

            <View className="flex-row items-center justify-center gap-1">
              <Text className="font-sans text-sm leading-5 text-ink-muted">
                New to Winly?
              </Text>
              {/* `replace`, so the two auth screens trade places instead of
                  stacking up each time you bounce between them. */}
              <Link href="/register" replace asChild>
                <Pressable accessibilityRole="button" className="active:opacity-60">
                  <Text className="font-body-semibold text-sm leading-5 text-ink">
                    Create an account
                  </Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
