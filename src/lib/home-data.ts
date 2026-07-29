import type { SymbolViewProps } from 'expo-symbols';

/**
 * Placeholder content for the home screen.
 *
 * What is left here has no endpoint yet: the daily metrics are invented, and the
 * feed tabs are labels the server has no filter for. Stories and the feed are
 * real now and live in `stories.ts` and `posts.ts`.
 *
 * The signed-in user's own greeting, avatar and streak are *not* here — those
 * come from `useAuth`, which has them today.
 */

export type Metric = {
  key: string;
  label: string;
  /** The reading under the ring — "6 / 8 cups". */
  value: string;
  /** 0–1. At 1 the screen adds a tick after the value. */
  progress: number;
  color: string;
  icon: SymbolViewProps['name'];
};

export const TODAY_METRICS: Metric[] = [
  {
    key: 'water',
    label: 'Water',
    value: '6 / 8 cups',
    progress: 6 / 8,
    color: '#609BF1',
    icon: { ios: 'drop.fill', android: 'water_drop', web: 'water_drop' },
  },
  {
    key: 'meditation',
    label: 'Meditation',
    value: '10 / 10 min',
    progress: 1,
    color: '#946FF0',
    icon: { ios: 'figure.mind.and.body', android: 'self_improvement', web: 'self_improvement' },
  },
  {
    key: 'steps',
    label: 'Steps',
    value: '6,245 / 8k',
    progress: 6245 / 8000,
    color: '#60BC88',
    icon: { ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' },
  },
  {
    key: 'reading',
    label: 'Reading',
    value: '15 / 30 min',
    progress: 0.5,
    color: '#E6AC49',
    icon: { ios: 'book', android: 'menu_book', web: 'menu_book' },
  },
  {
    key: 'gratitude',
    label: 'Gratitude',
    value: '1 / 1 entry',
    progress: 1,
    color: '#E0759C',
    icon: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
  },
];

export const FEED_TABS = ['For You', 'Following', 'Communities'] as const;
export type FeedTab = (typeof FEED_TABS)[number];
