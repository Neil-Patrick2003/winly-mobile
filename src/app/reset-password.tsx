import { router, useLocalSearchParams } from 'expo-router';
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
import { CodeInput } from '@/components/ui/code-input';
import { Field } from '@/components/ui/field';
import { Wordmark } from '@/components/wordmark';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { requestPasswordResetCode } from '@/lib/auth';
import { useAuth } from '@/lib/auth-context';
import { goBack } from '@/lib/navigation';
import { useToast } from '@/lib/toast';

const MIN_PASSWORD_LENGTH = 8;
const CODE_LENGTH = 6;
/**
 * How long before the server will send another code to the same address.
 *
 * It refuses quietly rather than with an error — a second request inside the
 * minute answers 200 and posts nothing — so the count has to be kept here to
 * stop the button promising a mail that is not coming.
 */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Step two of a forgotten password: the emailed code, and the new password.
 *
 * The code is good for 15 minutes and once only. A wrong code, an expired one
 * and an address with no account all come back as the same 422 under `code`,
 * so the message is shown as the server words it rather than being narrowed
 * down here.
 *
 * A success returns a live session, which is adopted straight away: the server
 * has already revoked every other token on the account, so there is no older
 * session left for this one to conflict with.
 */
export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { resetPassword } = useAuth();
  const toast = useToast();

  // Carried from the previous screen rather than retyped. It is only ever set
  // by that navigation, but a stray direct visit would leave it undefined, and
  // the field below is the recovery for that.
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');

  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  /** 422 messages from the API, keyed by its field names. */
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  /** Seconds left on a 429; the submit button stays disabled until zero. */
  const [cooldown, setCooldown] = useState(0);
  // Starts counting on arrival, because a code was just sent to get here.
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const codeValid = code.length === CODE_LENGTH;
  const passwordValid = password.length >= MIN_PASSWORD_LENGTH;
  const passwordInvalid = password.length > 0 && !passwordValid;
  const mismatch = confirmPassword.length > 0 && confirmPassword !== password;

  const formValid = emailValid && codeValid && passwordValid && confirmPassword === password;
  const canSubmit = formValid && !submitting && cooldown === 0;

  // Only one message at a time, nearest problem first.
  const error =
    formError ??
    serverErrors.code ??
    serverErrors.email ??
    serverErrors.password ??
    (mismatch
      ? 'Passwords do not match.'
      : passwordInvalid
        ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
        : null);

  /** Drop the server's complaint about a field as soon as it is edited. */
  const edit = (field: string, setValue: (value: string) => void) => (value: string) => {
    setValue(value);
    setFormError(null);
    setServerErrors((current) => {
      if (!(field in current)) return current;
      const { [field]: _removed, ...rest } = current;
      return rest;
    });
  };

  const handleResend = async () => {
    if (resendIn > 0 || resending || !emailValid) return;

    setResending(true);
    setFormError(null);
    // Restarted before the request rather than after it, so a double tap
    // cannot spend two of the six requests per minute the endpoint allows.
    setResendIn(RESEND_COOLDOWN_SECONDS);

    try {
      await requestPasswordResetCode(email);
      toast('A new code is on its way.');
    } catch (caught) {
      if (caught instanceof ApiError && caught.retryAfterSeconds) {
        setResendIn(caught.retryAfterSeconds);
      }
      setFormError(
        caught instanceof Error ? caught.message : 'Could not send another code. Try again shortly.'
      );
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    setServerErrors({});
    setFormError(null);

    try {
      await resetPassword({
        email,
        code,
        password,
        passwordConfirmation: confirmPassword,
      });
      router.replace('/(tabs)/home');
    } catch (caught) {
      if (caught instanceof ApiError) {
        setServerErrors(caught.fieldErrors);
        setFormError(Object.keys(caught.fieldErrors).length > 0 ? null : caught.message);
        if (caught.retryAfterSeconds) setCooldown(caught.retryAfterSeconds);
      } else {
        setFormError(
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
          onPress={() => goBack('/forgot-password')}
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
          <Text className="font-heading-bold text-2xl leading-8 text-ink">Check your email</Text>
          <Text className="font-sans text-sm leading-5 text-ink-muted">
            {params.email
              ? `If ${params.email} has an account, a six-digit code is on its way. It expires in 15 minutes.`
              : 'Enter the six-digit code we emailed you, then choose a new password.'}
          </Text>
        </View>

        <View className="gap-2.5 pt-6">
          {/* Only shown when the address did not come through from the previous
              screen — otherwise it is a field whose only use is to break a
              value that is already right. */}
          {params.email ? null : (
            <Field
              icon={{ ios: 'envelope', android: 'mail', web: 'mail' }}
              placeholder="Email address"
              value={email}
              onChangeText={edit('email', setEmail)}
              invalid={Boolean(serverErrors.email)}
              maxLength={255}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
            />
          )}

          {/* One box per digit. Focused on arrival, since typing the code is
              the only reason this screen is on screen. */}
          <CodeInput
            value={code}
            onChangeText={edit('code', setCode)}
            length={CODE_LENGTH}
            invalid={Boolean(serverErrors.code)}
            autoFocus={Boolean(params.email)}
          />

          <View className="pt-1.5" />

          <Field
            icon={{ ios: 'lock', android: 'lock', web: 'lock' }}
            placeholder="New password"
            value={password}
            onChangeText={edit('password', setPassword)}
            invalid={passwordInvalid || Boolean(serverErrors.password)}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
          />
          <Field
            icon={{ ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' }}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChangeText={edit('password_confirmation', setConfirmPassword)}
            invalid={mismatch || Boolean(serverErrors.password_confirmation)}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          {error ? (
            <Text className="px-4 font-sans text-xs leading-4 text-highlight">{error}</Text>
          ) : null}
        </View>

        {/* Says plainly that this signs the account's other devices out, because
            the server does that on every reset and finding out afterwards —
            when the tablet on the sofa has dropped to the sign-in screen — is
            worse than being told. */}
        <View className="mt-2 flex-row items-start gap-2 rounded-lg bg-surface-card p-4">
          <SymbolView
            name={{ ios: 'lock.shield', android: 'shield', web: 'shield' }}
            size={16}
            tintColor={Colors.light.textSecondary}
          />
          <Text className="flex-1 font-sans text-[13px] leading-[18px] text-ink-muted">
            Resetting your password signs you out everywhere else. You will stay signed in on this
            device.
          </Text>
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
                  ? 'Resetting…'
                  : cooldown > 0
                    ? `Try again in ${cooldown}s`
                    : 'Reset password'}
              </Text>
            </View>
          </Pressable>

          <View className="flex-row items-center justify-center gap-1">
            <Text className="font-sans text-sm leading-5 text-ink-muted">
              Didn&rsquo;t get the code?
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: resendIn > 0 || resending }}
              disabled={resendIn > 0 || resending}
              onPress={handleResend}
              hitSlop={6}
              className="active:opacity-60">
              <Text
                className={`font-body-semibold text-sm leading-5 ${
                  resendIn > 0 || resending ? 'text-ink-muted' : 'text-ink'
                }`}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Send another'}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
