import { Redirect, router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Field } from "@/components/ui/field";
import { Colors } from "@/constants/theme";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useConfirm } from "@/lib/confirm";
import { goBack } from "@/lib/navigation";
import { useToast } from "@/lib/toast";

/** What goes with the account, said plainly before anyone commits to it. */
const WHAT_GOES = [
  "Your profile, photo and cover",
  "Every win you have posted, with its photos",
  "Your stories, comments and likes",
  "Who you follow and who follows you",
  "Your circle memberships and invitations",
];

/**
 * Permanently delete the signed-in account.
 *
 * Both app stores require this to be reachable from inside the app. It asks
 * for the password, then asks once more, because there is no undo: the server
 * removes the person and everything they made rather than hiding it.
 *
 * Also works on the web build, which gives Google Play the deletion link it
 * asks for — someone who has uninstalled the app can sign in there and do it.
 */
export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, user, deleteAccount } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reached signed out only by link (the web build). Sign in first; the
  // account menu brings them back here.
  if (!isAuthenticated && !submitting) return <Redirect href="/login" />;

  const canSubmit = password.length > 0 && !submitting;

  const handleDelete = async () => {
    if (!canSubmit) return;

    const confirmed = await confirm({
      title: "Delete your account?",
      message:
        "This cannot be undone. Everything listed will be removed straight away.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;

    setSubmitting(true);
    setError(null);

    try {
      await deleteAccount(password);
      toast("Your account has been deleted");
      router.replace("/");
    } catch (caught) {
      setSubmitting(false);
      if (caught instanceof ApiError) {
        setError(
          caught.fieldErrors.password
            ? "That password is not right."
            : caught.message,
        );
      } else {
        setError(
          caught instanceof Error
            ? caught.message
            : "Something went wrong. Please try again.",
        );
      }
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      behavior={Platform.OS === "android" ? "padding" : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="w-full max-w-[800px] grow self-center px-4"
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <View className="flex-row items-center gap-2 pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => goBack("/settings")}
            hitSlop={8}
            className="-ml-2 p-2 active:opacity-60"
          >
            <SymbolView
              name={{
                ios: "chevron.left",
                android: "arrow_back",
                web: "arrow_back",
              }}
              size={18}
              tintColor={Colors.light.text}
            />
          </Pressable>
          <Text className="font-heading-bold text-xl leading-7 text-ink">
            Delete account
          </Text>
        </View>

        <Text className="pt-6 font-sans text-sm leading-5 text-ink-muted">
          {user?.email
            ? `Deleting ${user.email} removes it from Welle for good. This is what goes with it:`
            : "Deleting your account removes it from Welle for good. This is what goes with it:"}
        </Text>

        <View className="mt-4 gap-2.5 rounded-lg bg-surface-card p-4">
          {WHAT_GOES.map((item) => (
            <View key={item} className="flex-row items-start gap-2.5">
              <SymbolView
                name={{ ios: "xmark.circle", android: "cancel", web: "cancel" }}
                size={16}
                tintColor={Colors.light.textSecondary}
              />
              <Text className="flex-1 font-sans text-[13px] leading-[18px] text-ink">
                {item}
              </Text>
            </View>
          ))}
        </View>

        <Text className="pt-4 font-sans text-[13px] leading-[18px] text-ink-muted">
          Circles you created stay open for their other members. If you only
          want a break, sign out instead.
        </Text>

        <View className="gap-2.5 pt-6">
          <Text className="font-body-semibold text-sm leading-5 text-ink">
            Enter your password to continue
          </Text>
          <Field
            icon={{ ios: "lock", android: "lock", web: "lock" }}
            placeholder="Password"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setError(null);
            }}
            invalid={Boolean(error)}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleDelete}
          />
          {error ? (
            <Text className="px-4 font-sans text-xs leading-4 text-highlight">
              {error}
            </Text>
          ) : null}
        </View>

        <View className="pt-8">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
            disabled={!canSubmit}
            onPress={handleDelete}
            className={`items-center rounded-full py-3.5 active:opacity-85 ${
              canSubmit ? "" : "opacity-40"
            }`}
            style={{ backgroundColor: "#DC2626" }}
          >
            <View className="flex-row items-center gap-2">
              {submitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : null}
              <Text className="font-body-semibold text-base leading-6 text-white">
                {submitting ? "Deleting…" : "Delete my account"}
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
