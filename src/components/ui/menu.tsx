import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type MenuItem = {
  label: string;
  icon: SymbolViewProps['name'];
  onPress: () => void;
};

const MENU_WIDTH = 224;
const ROW_HEIGHT = 46;
/** The card's own vertical padding, top and bottom together. */
const MENU_PADDING = 10;
/** Breathing room from the trigger, and from the edge of the screen. */
const GAP = 6;
const EDGE = 12;

/**
 * A button that opens a short list of actions anchored beneath it.
 *
 * It renders through a `Modal` rather than as an absolutely positioned sibling,
 * because a feed card sits inside a scrolling list: a plain overlay would be
 * clipped by the row it belongs to, and would scroll away from the finger that
 * opened it. The modal also gives the backdrop that closes it.
 *
 * The position is measured from the trigger on every open — the same card can
 * be anywhere on screen — and the menu flips above the button when there is not
 * enough room below, so the last post in the list does not open a menu off the
 * bottom of the screen.
 */
export function MenuButton({
  items,
  accessibilityLabel = 'More options',
}: {
  items: MenuItem[];
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const anchor = useRef<View>(null);
  const [origin, setOrigin] = useState<{ top: number; left: number } | null>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const open = () => {
    const height = items.length * ROW_HEIGHT + MENU_PADDING;

    // `measureInWindow` gives coordinates against the screen, which is the frame
    // the modal draws in. Measuring against the parent would be off by however
    // far the list happens to be scrolled.
    anchor.current?.measureInWindow((x, y, triggerWidth, triggerHeight) => {
      // Right edges line up, then the whole thing is pulled back inside the
      // screen if that would hang it off the side.
      const left = Math.min(
        Math.max(EDGE, x + triggerWidth - MENU_WIDTH),
        screenWidth - MENU_WIDTH - EDGE
      );

      const below = y + triggerHeight + GAP;
      const fitsBelow = below + height <= screenHeight - EDGE;

      setOrigin({ top: fitsBelow ? below : Math.max(EDGE, y - height - GAP), left });
    });
  };

  const close = () => setOrigin(null);

  return (
    <>
      <Pressable
        ref={anchor}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: origin !== null }}
        onPress={open}
        hitSlop={8}
        className="p-1 active:opacity-60">
        <SymbolView
          name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
          size={18}
          tintColor={theme.textSecondary}
        />
      </Pressable>

      <Modal
        visible={origin !== null}
        transparent
        animationType="fade"
        // Android's hardware back should dismiss the menu, not the screen.
        onRequestClose={close}>
        <Pressable accessibilityLabel="Close menu" onPress={close} className="flex-1 bg-black/20" />

        {origin ? (
          <View
            className="absolute overflow-hidden rounded-2xl border border-hairline bg-surface-card"
            style={{
              top: origin.top,
              left: origin.left,
              width: MENU_WIDTH,
              paddingVertical: MENU_PADDING / 2,
              boxShadow: '0 12px 28px rgba(0, 0, 0, 0.18)',
            }}>
            {items.map((item) => (
              <Pressable
                key={item.label}
                accessibilityRole="menuitem"
                onPress={() => {
                  // Closed first: the action may show a toast or navigate, and
                  // doing that under an open menu looks stuck.
                  close();
                  item.onPress();
                }}
                style={{ height: ROW_HEIGHT }}
                className="flex-row items-center gap-3 px-4 active:bg-surface-selected">
                <SymbolView name={item.icon} size={17} tintColor={theme.text} />
                <Text numberOfLines={1} className="flex-1 font-sans text-[15px] leading-5 text-ink">
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Modal>
    </>
  );
}
