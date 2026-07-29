import { ScreenScaffold } from '@/components/screen-scaffold';

/**
 * Where guided sessions and categories will be managed.
 *
 * A stub on purpose: the profile offers the row to admins because the design
 * calls for it and `is_admin` is real, but nothing behind it is built yet. A
 * row that led nowhere at all would be worse than one that says so.
 */
export default function ManageMeditationsScreen() {
  return (
    <ScreenScaffold
      icon={{ ios: 'gearshape.2', android: 'settings', web: 'settings' }}
      title="Manage meditations"
      subtitle="Categories and guided sessions will be managed here. Nothing to edit just yet."
    />
  );
}
