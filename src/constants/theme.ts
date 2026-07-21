/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

/**
 * Winly brand palette — "Fresh Growth". Raw brand values, unchanged across
 * schemes. Prefer the scheme-aware `Colors` below when styling UI; reach for
 * `Brand` only when a value must stay identical in light and dark (logo, splash).
 */
export const Brand = {
  primary: '#22C55E',
  secondary: '#38BDF8',
  accent: '#8B5CF6',
  highlight: '#FB7185',
  success: '#FACC15',
} as const;

export const Colors = {
  light: {
    text: '#0F172A',
    textSecondary: '#64748B',
    background: '#F8FAFC',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E2E8F0',
    border: '#E2E8F0',
    primary: Brand.primary,
    secondary: Brand.secondary,
    accent: Brand.accent,
    highlight: Brand.highlight,
    success: Brand.success,
    onPrimary: '#FFFFFF',
  },
  dark: {
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    background: '#0F172A',
    backgroundElement: '#1E293B',
    backgroundSelected: '#334155',
    border: '#334155',
    // Lifted toward the lighter end of each hue so they clear contrast on slate.
    primary: '#4ADE80',
    secondary: '#7DD3FC',
    accent: '#A78BFA',
    highlight: '#FDA4AF',
    success: '#FDE047',
    onPrimary: '#052E16',
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
  /** Headings — Sora SemiBold */
  heading: 'Sora_600SemiBold',
  headingBold: 'Sora_700Bold',
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
