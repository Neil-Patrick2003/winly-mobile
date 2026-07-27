import { ScreenScaffold } from '@/components/screen-scaffold';

export default function NotificationsScreen() {
  return (
    <ScreenScaffold
      icon={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
      title="Notifications"
      subtitle="Cheers, follows and replies will show up here."
    />
  );
}
