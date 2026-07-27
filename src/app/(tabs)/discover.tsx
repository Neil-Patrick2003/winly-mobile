import { ScreenScaffold } from '@/components/screen-scaffold';

export default function DiscoverScreen() {
  return (
    <ScreenScaffold
      icon={{ ios: 'safari', android: 'explore', web: 'explore' }}
      title="Discover"
      subtitle="Find people and wins worth following. Nothing to browse just yet."
    />
  );
}
