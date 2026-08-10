/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

/**
 * Welle brand palette — "Forest". Raw brand values, unchanged across schemes.
 * Prefer the scheme-aware `Colors` below when styling UI; reach for `Brand` only
 * when a value must stay identical in light and dark (logo, splash).
 *
 * Four colours and a page. `forest` is the darkest of them and doubles as the
 * text colour, which is what keeps the type in the same family as everything
 * else rather than sitting on it as neutral slate.
 */
export const Brand = {
  forest: '#0F3D2E',
  primary: '#2E7D56',
  secondary: '#4DB6AC',
  accent: '#5A7BD8',
  highlight: '#FB7185',
  success: '#FACC15',
} as const;

export const Colors = {
  light: {
    text: Brand.forest,
    // The greys are tinted towards the green rather than left on slate: a warm
    // page under cool type reads as a background someone swapped, not a palette.
    textSecondary: '#4F7263',
    background: '#F4F7F2',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E7EDE4',
    border: '#E1E9DE',
    primary: Brand.primary,
    secondary: Brand.secondary,
    accent: Brand.accent,
    highlight: Brand.highlight,
    success: Brand.success,
    onPrimary: '#FFFFFF',
  },
  dark: {
    text: '#F4F7F2',
    textSecondary: '#A3BFB2',
    // The page is the brand green taken darker still, so a card sitting on it
    // can be the brand green itself.
    background: '#0B241B',
    backgroundElement: Brand.forest,
    backgroundSelected: '#1C5641',
    border: '#1C5641',
    // Lifted toward the lighter end of each hue so they clear contrast on it.
    primary: '#4DB07C',
    secondary: '#6ECFC6',
    accent: '#8AA4E6',
    highlight: '#FDA4AF',
    success: '#FDE047',
    onPrimary: '#06251A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

const SystemFonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
})!;

/**
 * Brand type stack. These names are the family keys registered by `useBrandFonts`
 * in the root layout — they resolve on native and web alike, so there is no
 * platform branching here.
 *
 * These are static (non-variable) faces: set `fontFamily` alone and leave
 * `fontWeight` off, otherwise Android synthesizes a second, wrong weight.
 */
export const Fonts = {
  ...SystemFonts,
  /** Wordmark only — Plus Jakarta Sans Bold */
  logo: 'PlusJakartaSans_700Bold',
  logoExtraBold: 'PlusJakartaSans_800ExtraBold',
  /** Headings — Playfair Display */
  heading: 'PlayfairDisplay_600SemiBold',
  headingBold: 'PlayfairDisplay_700Bold',
  /** Body copy — Inter */
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
