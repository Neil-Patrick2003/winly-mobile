import { Alert, Platform } from 'react-native';

/**
 * Ask before doing something that cannot be undone.
 *
 * React Native Web's `Alert` is a no-op — literally `static alert() {}` — so it
 * draws nothing and calls nothing back. An action guarded by it does not become
 * unconfirmed on the web; it becomes unreachable, because the callback that
 * would have done the work never runs. `window.confirm` is the plain
 * equivalent there, and blocks in the same way the native sheet does.
 *
 * Resolves `false` on dismissal, so the safe answer is the default everywhere.
 */
export function confirmDestructive({
  title,
  message,
  confirmLabel = 'Delete',
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    const prompt = message ? `${title}\n\n${message}` : title;

    return Promise.resolve(globalThis.confirm?.(prompt) ?? false);
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      // Android dismisses on a back press or a tap outside, which calls none of
      // the buttons above. Without this the promise would never settle.
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
