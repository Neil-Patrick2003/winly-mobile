import { router } from 'expo-router';
import { Tabs, TabList, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, Text, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

type Icon = SymbolViewProps['name'];

/**
 * The bar itself. `TabList asChild` hands its props down, so this is the row
 * that actually renders — safe-area padding included, since it sits flush with
 * the bottom edge.
 */
function TabBar({ children, style, ...props }: ViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      {...props}
      className="flex-row items-end justify-center gap-1 border-t border-hairline bg-surface-card px-2 pt-3"
      style={[
        // On a gesture-bar device the inset already supplies the breathing room
        // below; on a device without one, 14 stands in for it.
        { paddingBottom: Math.max(insets.bottom, 14) },
        style,
      ]}>
      {children}
    </View>
  );
}

/**
 * The caption under every tab. Leading is pinned to the glyph height: the
 * default line box on an 11px font adds a few points of air that read as a gap
 * under the icon.
 */
function TabLabel({ children, isFocused }: { children: string; isFocused?: boolean }) {
  return (
    <Text
      className={`mt-1 font-sans text-[11px] leading-[13px] ${
        isFocused ? 'text-primary' : 'text-ink-muted'
      }`}>
      {children}
    </Text>
  );
}

/** Icon over label. The filled variant marks the active tab on iOS. */
function TabButton({
  icon,
  activeIcon,
  label,
  isFocused,
  ...props
}: TabTriggerSlotProps & { icon: Icon; activeIcon: Icon; label: string }) {
  const tint = isFocused ? Colors.light.primary : Colors.light.textSecondary;

  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={label}
      className="px-2 active:opacity-60">
      {/* A plain View owns the stacking. Pressable does not reliably lay its
          children out as a column here, so icon and label ended up side by
          side; a View always defaults to `flexDirection: 'column'`. */}
      <View className="flex-col items-center">
        <SymbolView name={isFocused ? activeIcon : icon} size={24} tintColor={tint} />
        <TabLabel isFocused={isFocused}>{label}</TabLabel>
      </View>
    </Pressable>
  );
}

/**
 * Create. A rounded square rather than an icon, so it reads as an action, but
 * captioned like the rest so the row of labels stays level.
 *
 * Not a `TabTrigger`: there is no Create tab to select — this opens the Share
 * flow as a modal over whichever tab you were on, and returns you to it. A
 * plain child of `TabList` is ignored by expo-router's trigger parsing, so it
 * renders in the row without registering a route.
 */
function CreateButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Share a small win"
      onPress={() => router.push('/entry')}
      className="px-2 active:opacity-60">
      <View className="flex-col items-center">
        <View className="h-7 w-7 items-center justify-center rounded-lg bg-gray-100">
          <SymbolView
            name={{ ios: 'plus', android: 'add', web: 'add' }}
            size={18}
            weight="semibold"
            tintColor={Colors.light.text}
          />
        </View>
        <TabLabel>Create</TabLabel>
      </View>
    </Pressable>
  );
}

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot />
      <TabList asChild>
        <TabBar>
          <TabTrigger name="home" href="/home" asChild>
            <TabButton
              label="Home"
              icon={{ ios: 'house', android: 'home', web: 'home' }}
              activeIcon={{ ios: 'house.fill', android: 'home', web: 'home' }}
            />
          </TabTrigger>

          <TabTrigger name="discover" href="/discover" asChild>
            <TabButton
              label="Discover"
              icon={{ ios: 'safari', android: 'explore', web: 'explore' }}
              activeIcon={{ ios: 'safari.fill', android: 'explore', web: 'explore' }}
            />
          </TabTrigger>

          <CreateButton />

          {/* Took the slot Alerts held. Notifications did not go anywhere —
              they are still a tap away on the bell in the header, which is
              where the design put them. */}
          <TabTrigger name="circles" href="/circles" asChild>
            <TabButton
              label="Circles"
              icon={{ ios: 'person.2', android: 'group', web: 'group' }}
              activeIcon={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
            />
          </TabTrigger>

          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton
              label="Profile"
              icon={{ ios: 'person', android: 'person', web: 'person' }}
              activeIcon={{ ios: 'person.fill', android: 'person', web: 'person' }}
            />
          </TabTrigger>
        </TabBar>
      </TabList>
    </Tabs>
  );
}
