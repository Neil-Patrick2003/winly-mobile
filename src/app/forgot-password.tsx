import { Link, router, useLocalSearchParams } from 'expo-router';
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

import { LeafDivider } from '@/components/leaf';
import { Field } from '@/components/ui/field';
import { Wordmark } from '@/components/wordmark';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { requestPasswordResetCode } from '@/lib/auth';
import { goBack } from '@/lib/navigation';

/**
 * Step one of a forgotten password: say which account.
 *
 * `POST /api/v1/forgot-password` answers the same 200 whether or not that
 * address has an account — so this cannot report "no account with that email",
 * and must not try. It moves on to the code screen either way, which is also
 * the truthful thing to do: if nothing is there, nothing arrives, and the
 * person finds that out from their own inbox rather than from us confirming
 * which addresses are registered.
 */
export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  // Prefilled from whatever was typed on the sign-in screen, which is usually
  // the address in question — someone reaches for this link after an attempt
  // that did not work, not before one.
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');

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
  const canSubmit = emailValid && !submitting && cooldown === 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      await requestPasswordResetCode(email);
      // `push`, not `replace`: the code screen's back button should come back
      // here, so a typo in the address can be corrected without starting over.
      router.push({ pathname: '/reset-password', params: { email: email.trim() } });
    } catch (caught) {
      if (caught instanceof ApiError) {
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
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      // Android only; the scroller below handles iOS. The reasoning is set out
      // in full on the sign-up screen, which has the same shape.
      behavior={Platform.OS === 'android' ? 'padding' : undefined}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="w-full max-w-[800px] grow self-center px-4"
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => goBack('/login')}
          className="-ml-2 mt-2 self-start p-2 active:opacity-60">
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={18}
            tintColor={Colors.light.text}
          />
        </Pressable>

        <View className="items-center gap-2 pt-4">
          <Wordmark />
          <LeafDivider />
        </View>

        <View className="gap-1 pt-6">
          <Text className="font-heading-bold text-2xl leading-8 text-ink">
            Forgot your password?
          </Text>
          <Text className="font-sans text-sm leading-5 text-ink-muted">
            Tell us the email you signed up with and we&rsquo;ll send you a six-digit code to get
            back in.
          </Text>
        </View>

        <View className="gap-2.5 pt-6">
          <Field
            icon={{ ios: 'envelope', android: 'mail', web: 'mail' }}
            placeholder="Email address"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setError(null);
            }}
            invalid={emailInvalid || Boolean(error)}
            maxLength={255}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
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
            className={`items-center rounded-full bg-primary py-3.5 active:opacity-85 ${
              canSubmit ? '' : 'opacity-40'
            }`}
            style={canSubmit ? { boxShadow: '0 8px 20px rgba(34, 197, 94, 0.35)' } : undefined}>
            <View className="flex-row items-center gap-2">
              {submitting ? <ActivityIndicator size="small" color="#ffffff" /> : null}
              <Text className="font-body-semibold text-base leading-6 text-white">
                {submitting
                  ? 'Sending code…'
                  : cooldown > 0
                    ? `Try again in ${cooldown}s`
                    : 'Send code'}
              </Text>
            </View>
          </Pressable>

          <View className="flex-row items-center justify-center gap-1">
            <Text className="font-sans text-sm leading-5 text-ink-muted">
              Remembered it after all?
            </Text>
            {/* `replace`, so this screen does not sit under sign-in waiting to
                be returned to by a back gesture. */}
            <Link href="/login" replace asChild>
              <Pressable accessibilityRole="button" className="active:opacity-60">
                <Text className="font-body-semibold text-sm leading-5 text-ink">Log In</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
