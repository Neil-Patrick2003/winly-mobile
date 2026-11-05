import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
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

import { TextArea } from '@/components/ui/text-area';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import {
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  reportContent,
  type ReportReason,
  type ReportType,
} from '@/lib/moderation';
import { goBack } from '@/lib/navigation';
import { useModeration } from '@/lib/use-moderation';
import { useToast } from '@/lib/toast';

const TITLES: Record<ReportType, string> = {
  post: 'Report post',
  comment: 'Report comment',
  story: 'Report story',
  user: 'Report account',
};

/**
 * Report a post, comment, story or person to the moderators.
 *
 * Reached from the "..." menus. Pick a reason, optionally say more, send. Once
 * it is sent, offers to block the person too, since a report alone hides
 * nothing: the moderators decide what happens to the content.
 */
export default function ReportScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const showToast = useToast();
  const { block } = useModeration();
  const params = useLocalSearchParams<{
    type: ReportType;
    id: string;
    authorId?: string;
    authorName?: string;
  }>();

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const type: ReportType = params.type in TITLES ? params.type : 'post';
  const canSend = reason !== null && !sending && Boolean(token && params.id);

  const send = async () => {
    if (!canSend || !reason || !token) return;

    setSending(true);
    setError(null);

    try {
      await reportContent({ type, id: params.id, reason, note }, token);
    } catch (caught) {
      setSending(false);
      setError(caught instanceof Error ? caught.message : 'Could not send that. Try again.');
      return;
    }

    showToast('Thanks. We review reports within 24 hours.');

    // Offered once the report is in, not before, so the report never depends
    // on the answer.
    if (params.authorId && params.authorName) {
      await block({ id: params.authorId, name: params.authorName });
    }

    goBack();
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      behavior={Platform.OS === 'android' ? 'padding' : undefined}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="w-full max-w-[800px] grow self-center px-4"
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets>
        <View className="flex-row items-center gap-2 pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => goBack()}
            hitSlop={8}
            className="-ml-2 p-2 active:opacity-60">
            <SymbolView
              name={{ ios: 'xmark', android: 'close', web: 'close' }}
              size={18}
              tintColor={Colors.light.text}
            />
          </Pressable>
          <Text className="font-heading-bold text-xl leading-7 text-ink">{TITLES[type]}</Text>
        </View>

        <Text className="pt-5 font-sans text-sm leading-5 text-ink-muted">
          Why are you reporting this? Reports are private. The person is not told who sent it.
        </Text>

        <View className="mt-4 overflow-hidden rounded-lg bg-surface-card">
          {REPORT_REASONS.map((option, at) => {
            const selected = reason === option.key;
            return (
              <View key={option.key}>
                {at > 0 ? <View className="mx-4 h-px bg-hairline" /> : null}
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => {
                    setReason(option.key);
                    setError(null);
                  }}
                  className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-70">
                  <Text className="flex-1 font-sans text-[15px] leading-5 text-ink">
                    {option.label}
                  </Text>
                  <View
                    className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
                      selected ? '' : 'border-hairline'
                    }`}
                    style={selected ? { borderColor: Colors.light.primary } : undefined}>
                    {selected ? (
                      <View
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: Colors.light.primary }}
                      />
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>

        <Text className="pt-5 font-body-semibold text-sm leading-5 text-ink">
          Anything else we should know? <Text className="font-sans text-ink-muted">(optional)</Text>
        </Text>
        <View className="mt-2">
          <TextArea
            placeholder="Add details"
            value={note}
            onChangeText={setNote}
            maxLength={REPORT_NOTE_MAX}
          />
        </View>

        {error ? (
          <Text className="px-4 pt-3 font-sans text-xs leading-4 text-highlight">{error}</Text>
        ) : null}

        <View className="pt-8">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={() => void send()}
            className={`items-center rounded-full bg-primary py-3.5 active:opacity-85 ${
              canSend ? '' : 'opacity-40'
            }`}>
            <View className="flex-row items-center gap-2">
              {sending ? <ActivityIndicator size="small" color="#ffffff" /> : null}
              <Text className="font-body-semibold text-base leading-6 text-white">
                {sending ? 'Sending…' : 'Send report'}
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
