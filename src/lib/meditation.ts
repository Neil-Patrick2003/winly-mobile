import type { SymbolViewProps } from 'expo-symbols';

/**
 * Meditation categories shown in the Create flow. Static for now — this will
 * come from the backend once there is an endpoint, so keep the shape close to
 * what an API row would return.
 *
 * `sample.video` is a guided session (a player is shown); its absence means an
 * unguided/self-timed sample (just a prompt). The video URLs are placeholder
 * public clips — swap them for real guided-session media before shipping.
 */
export type MeditationSample = {
  title: string;
  duration: string;
  /** Present ⇒ guided, and a video player is shown for it. */
  video?: string;
  /** Shown under the title on the sample step. */
  description: string;
};

export type MeditationCategory = {
  id: string;
  name: string;
  icon: SymbolViewProps['name'];
  blurb: string;
  sample: MeditationSample;
};

export const MEDITATION_CATEGORIES: MeditationCategory[] = [
  {
    id: 'breathing',
    name: 'Breathing',
    icon: { ios: 'wind', android: 'air', web: 'air' },
    blurb: 'Slow, counted breaths to settle a busy mind in a few minutes.',
    sample: {
      title: 'Box breathing',
      duration: '3 min',
      description: 'A short guided round of 4-count breathing to steady yourself.',
      video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    },
  },
  {
    id: 'body-scan',
    name: 'Body scan',
    icon: { ios: 'figure.mind.and.body', android: 'self_improvement', web: 'self_improvement' },
    blurb: 'Move attention gently through the body to release tension.',
    sample: {
      title: 'Head-to-toe scan',
      duration: '5 min',
      description: 'A guided pass down the body, softening each area in turn.',
      video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    },
  },
  {
    id: 'loving-kindness',
    name: 'Loving-kindness',
    icon: { ios: 'heart', android: 'favorite', web: 'favorite' },
    blurb: 'Warm, repeated well-wishes for yourself and others.',
    sample: {
      title: 'A kind wish',
      duration: '4 min',
      description: 'Offer a simple phrase of goodwill, first to yourself, then outward.',
    },
  },
  {
    id: 'focus',
    name: 'Focus',
    icon: { ios: 'scope', android: 'center_focus_strong', web: 'center_focus_strong' },
    blurb: 'Anchor on a single point to sharpen a scattered mind.',
    sample: {
      title: 'One-pointed attention',
      duration: '5 min',
      description: 'Rest attention on the breath and return to it whenever it wanders.',
    },
  },
  {
    id: 'sleep',
    name: 'Sleep',
    icon: { ios: 'moon.stars', android: 'bedtime', web: 'bedtime' },
    blurb: 'Wind down and let the day go before rest.',
    sample: {
      title: 'Letting the day go',
      duration: '6 min',
      description: 'A slow, quiet guide toward sleep.',
      video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    },
  },
];
