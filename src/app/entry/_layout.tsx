import { Stack } from 'expo-router';

import { EntryDraftProvider } from '@/lib/entry-draft';

/**
 * The ESC entry flow — a focused stack presented over the tabs, so it has no
 * tab bar or shared app header. Meditation → Learning → Movement each push onto
 * this stack, all sharing one draft so nothing typed is lost moving between them.
 */
export default function EntryLayout() {
  return (
    <EntryDraftProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </EntryDraftProvider>
  );
}
