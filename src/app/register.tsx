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

import { LeafDivider } from '@/components/leaf';
import { Field } from '@/components/ui/field';
import { Wordmark } from '@/components/wordmark';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { goBack } from '@/lib/navigation';

const MIN_PASSWORD_LENGTH = 8;
/** 3–30 characters, lowercase letters, numbers and underscores — server rule. */
const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

/**
 * Sign-up against `POST /api/v1/register`, which returns a live Sanctum token —
 * there is no email-verification gate, so a 201 goes straight into the app.
 *
 * Local validation mirrors the documented rules so the common mistakes are
 * caught before a request is spent (the endpoint allows 6/min per IP), but the
 * server stays authoritative: its 422 messages are shown against the fields.
 */
export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  /** 422 messages from the API, keyed by its field names. */
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  /** Seconds left on a 429 rate limit; the button stays disabled until zero. */
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // The server trims and lowercases before validating, so check what it will
  // actually store rather than what was typed.
  const normalizedUsername = username.trim().toLowerCase();
  const usernameValid = USERNAME_PATTERN.test(normalizedUsername);
  const usernameInvalid = normalizedUsername.length > 0 && !usernameValid;
  // Deliberately loose: something@something.tld. Anything stricter rejects
  // addresses that are actually valid; the real check is the confirmation mail.
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const emailInvalid = email.trim().length > 0 && !emailValid;
  // A length, and nothing else — the same rule the server keeps. There was a
  // second clause here demanding a number or symbol, which the server never
  // asked for in development and asked far more of in production; the two
  // disagreeing is what made the note below wrong wherever you happened to be.
  const passwordValid = password.length >= MIN_PASSWORD_LENGTH;
  const passwordInvalid = password.length > 0 && !passwordValid;
  const mismatch = confirmPassword.length > 0 && confirmPassword !== password;

  const formValid =
    fullName.trim().length > 0 &&
    usernameValid &&
    emailValid &&
    passwordValid &&
    confirmPassword === password;
  const canSubmit = formValid && !submitting && cooldown === 0;

  // Only one message at a time, nearest problem first. The standing rule is
  // spelled out in the note below the fields, so this stays error-only.
  const error =
    formError ??
    serverErrors.full_name ??
    serverErrors.username ??
    serverErrors.email ??
    serverErrors.password ??
    (usernameInvalid
      ? 'Username must be 3–30 characters: lowercase letters, numbers and underscores.'
      : emailInvalid
        ? 'Enter a valid email address.'
        : mismatch
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

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    setServerErrors({});
    setFormError(null);

    try {
      await register({ fullName, username, email, password, passwordConfirmation: confirmPassword });
      router.replace('/(tabs)/home');
    } catch (caught) {
      if (caught instanceof ApiError) {
        setServerErrors(caught.fieldErrors);
        // A 422 already reads on the offending field; anything else needs the
        // top-level message, which is all the user has to go on.
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
      /*
       * Android only, and the ScrollView below handles iOS.
       *
       * Android needs it because edge-to-edge — on by default since SDK 54 —
       * stops the window resizing when the keyboard opens, so nothing moves
       * unless this moves it. iOS must not have it: padding the container
       * shrinks the scroller's viewport without touching its scroll position,
       * which is exactly how the last fields on this form — password and its
       * confirmation — ended up under the keyboard with no sign that anything
       * was being typed. Applying both would cancel the fix out, since a
       * scroller already lifted clear of the keyboard has nothing to inset.
       */
      behavior={Platform.OS === 'android' ? 'padding' : undefined}>
      {/* Insets the content by however much the keyboard covers and scrolls the
          focused field clear of it. iOS only; ignored elsewhere. */}
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
          onPress={() => goBack('/')}
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
            Create your account
          </Text>
          <Text className="font-sans text-sm leading-5 text-ink-muted">
            Join Welle and start sharing your journey, celebrating small wins, and inspire others.
          </Text>
        </View>

        <View className="gap-2.5 pt-6">
          <Field
            icon={{ ios: 'person', android: 'person', web: 'person' }}
            placeholder="Name"
            value={fullName}
            onChangeText={edit('full_name', setFullName)}
            invalid={Boolean(serverErrors.full_name)}
            maxLength={255}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
          />
          <Field
            icon={{ ios: 'at', android: 'alternate_email', web: 'alternate_email' }}
            placeholder="Username"
            value={username}
            onChangeText={edit('username', setUsername)}
            invalid={usernameInvalid || Boolean(serverErrors.username)}
            maxLength={30}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
          />
          <Field
            icon={{ ios: 'envelope', android: 'mail', web: 'mail' }}
            placeholder="Email address"
            value={email}
            onChangeText={edit('email', setEmail)}
            invalid={emailInvalid || Boolean(serverErrors.email)}
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
            placeholder="Confirm password"
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
        {/* The standing rule, and then the answer to it.
            Saying "at least 8 characters" and nothing more leaves somebody
            counting their own typing to find out whether they are done. Once
            the password clears the bar this says so outright, which is the
            only moment the note has anything new to add. */}
        <View
          accessibilityRole="text"
          accessibilityLabel={
            passwordValid
              ? 'Password is long enough'
              : `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
          }
          className={`mt-2 flex-row items-start gap-2 rounded-lg p-4 ${
            passwordValid ? 'bg-green-100' : 'bg-surface-card'
          }`}>
          <SymbolView
            name={
              passwordValid
                ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }
                : { ios: 'checkmark.shield', android: 'shield', web: 'shield' }
            }
            size={16}
            tintColor={passwordValid ? Colors.light.primary : Colors.light.textSecondary}
          />
          <Text
            className={`flex-1 font-sans text-[13px] leading-[18px] ${
              passwordValid ? 'text-ink' : 'text-ink-muted'
            }`}>
            {passwordValid
              ? 'That password will do nicely.'
              : `Password must be at least ${MIN_PASSWORD_LENGTH} characters`}
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
                  ? 'Creating account…'
                  : cooldown > 0
                    ? `Try again in ${cooldown}s`
                    : 'Create account'}
              </Text>
            </View>
          </Pressable>

          <View className="flex-row items-center justify-center gap-1">
            <Text className="font-sans text-sm leading-5 text-ink-muted">
              Already have an account?
            </Text>
            {/* `replace`, so the two auth screens trade places instead of
                stacking up each time you bounce between them. */}
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
