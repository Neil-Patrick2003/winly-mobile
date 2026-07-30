import { createContext, use, useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';

/**
 * What to ask, and what the two answers are called.
 *
 * `destructive` colours the confirming action red and is the only thing that
 * changes about it — a dialog that asks the question differently depending on
 * how bad the answer is would make the ordinary ones easy to skim past.
 */
export type ConfirmOptions = {
  title: string;
  message?: string;
  /** Defaults to "Confirm". */
  confirmLabel?: string;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  destructive?: boolean;
};

type Pending = ConfirmOptions & { resolve: (confirmed: boolean) => void };

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

/** iOS's own tint for an actionable label, and its red for a destructive one. */
const IOS_BLUE = '#007AFF';
const DESTRUCTIVE = '#E5484D';

/**
 * One dialog for every question worth asking twice.
 *
 * `Alert.alert` was doing this job and cannot be styled at all: it is drawn by
 * the OS, so it ignores the app's type, its colours and its corners, and looks
 * like two different products across the two platforms. This is the same shape
 * in both places — white card, soft shadow, dimmed backdrop — while still
 * arranging itself the way each platform's own dialogs do, because a dialog
 * that puts its buttons where the platform does not is the one thing people
 * genuinely misread.
 *
 * Imperative rather than declarative, because every call site is inside a
 * handler that wants to stop and wait: `if (!(await confirm({…}))) return;`
 * reads as the guard it is, where a piece of state and a rendered `<Dialog>`
 * would scatter one decision across three places.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  /*
   * Held in a ref as well as in state so that answering can settle the promise
   * without depending on the render that is about to clear it — closing sets
   * state to null, and a resolver read from that would already be gone.
   */
  const active = useRef<Pending | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    // Anything already open is answered "no" rather than left hanging. Two
    // dialogs cannot be shown at once, so the older question is abandoned.
    active.current?.resolve(false);

    return new Promise<boolean>((resolve) => {
      const next = { ...options, resolve };
      active.current = next;
      setPending(next);
    });
  }, []);

  const answer = useCallback((confirmed: boolean) => {
    active.current?.resolve(confirmed);
    active.current = null;
    setPending(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <Modal
        visible={pending !== null}
        transparent
        animationType="fade"
        // Android's back gesture is a cancel, the same as tapping away.
        onRequestClose={() => answer(false)}>
        <Pressable
          accessibilityLabel="Dismiss"
          // Tapping the backdrop is the cancel, which is what both platforms do
          // for a dialog that has one.
          onPress={() => answer(false)}
          className="flex-1 items-center justify-center bg-black/40 px-8">
          {/* Swallows the press, so tapping the card itself does not dismiss
              the question it is asking. */}
          <Pressable
            accessibilityViewIsModal
            onPress={() => {}}
            className={
              Platform.OS === 'ios'
                ? 'w-full max-w-[280px] overflow-hidden rounded-[14px] bg-surface-card'
                : 'w-full max-w-[360px] overflow-hidden rounded-[28px] bg-surface-card'
            }
            style={{ boxShadow: '0 12px 32px rgba(15, 23, 42, 0.22)' }}>
            {pending ? (
              Platform.OS === 'ios' ? (
                <IosDialog {...pending} onAnswer={answer} />
              ) : (
                <MaterialDialog {...pending} onAnswer={answer} />
              )
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </ConfirmContext.Provider>
  );
}

type DialogProps = ConfirmOptions & { onAnswer: (confirmed: boolean) => void };

/**
 * Centred text, then a row of two equal buttons split by hairlines — the shape
 * of every alert iOS draws itself. Cancel is the bold one, because on iOS the
 * emphasised button is the safe one rather than the suggested one.
 */
function IosDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onAnswer,
}: DialogProps) {
  return (
    <View>
      <View className="items-center gap-1 px-4 pb-4 pt-5">
        <Text className="text-center font-body-semibold text-[17px] leading-[22px] text-ink">
          {title}
        </Text>
        {message ? (
          <Text className="text-center font-sans text-[13px] leading-[18px] text-ink-muted">
            {message}
          </Text>
        ) : null}
      </View>

      <View className="h-px bg-hairline" />

      <View className="flex-row">
        <Pressable
          accessibilityRole="button"
          onPress={() => onAnswer(false)}
          className="flex-1 items-center justify-center py-3 active:bg-surface-selected">
          <Text
            className="font-body-semibold text-[17px] leading-[22px]"
            style={{ color: IOS_BLUE }}>
            {cancelLabel}
          </Text>
        </Pressable>

        <View className="w-px bg-hairline" />

        <Pressable
          accessibilityRole="button"
          onPress={() => onAnswer(true)}
          className="flex-1 items-center justify-center py-3 active:bg-surface-selected">
          <Text
            className="font-sans text-[17px] leading-[22px]"
            style={{ color: destructive ? DESTRUCTIVE : IOS_BLUE }}>
            {confirmLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Left-aligned text with the actions gathered bottom-right, which is where
 * Material puts them — and far enough from the edge of the card to read as
 * buttons rather than as links.
 */
function MaterialDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onAnswer,
}: DialogProps) {
  return (
    <View className="gap-4 px-6 pb-4 pt-6">
      <View className="gap-2">
        <Text className="font-heading-bold text-[22px] leading-7 text-ink">{title}</Text>
        {message ? (
          <Text className="font-sans text-[14px] leading-5 text-ink-muted">{message}</Text>
        ) : null}
      </View>

      <View className="flex-row justify-end gap-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => onAnswer(false)}
          className="rounded-full px-4 py-2.5 active:bg-surface-selected">
          <Text className="font-body-semibold text-[14px] leading-5 text-ink-muted">
            {cancelLabel}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => onAnswer(true)}
          className="rounded-full px-4 py-2.5 active:bg-surface-selected">
          <Text
            className="font-body-semibold text-[14px] leading-5"
            style={{ color: destructive ? DESTRUCTIVE : undefined }}>
            {confirmLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Ask, and wait for the answer.
 *
 * Resolves false for every way of saying no — the cancel button, the backdrop,
 * Android's back gesture — so a caller only ever has one case to handle.
 */
export function useConfirm() {
  const context = use(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return context;
}
