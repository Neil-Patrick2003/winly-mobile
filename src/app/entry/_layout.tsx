import { Stack } from 'expo-router';

import { EntryDraftProvider } from '@/lib/entry-draft';

/**
 * The Share-a-win flow — a focused stack presented over the tabs, so it has no
 * tab bar or shared app header. Intro → Meditation → Learning → Movement →
 * Review each push onto this stack, all sharing one draft so nothing entered is
 * lost stepping between them (or jumping back from Review's Edit links).
 */
export default function EntryLayout() {
  return (
    <EntryDraftProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </EntryDraftProvider>
  );
}
