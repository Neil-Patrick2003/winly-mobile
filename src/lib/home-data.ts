/**
 * Placeholder content for the home screen.
 *
 * What is left here has no endpoint yet: the feed tabs are labels the server
 * has no filter for. Stories, the feed and the weekly progress are real now and
 * live in `stories.ts`, `posts.ts` and `progress.ts`.
 *
 * The signed-in user's own greeting, avatar and streak are *not* here — those
 * come from `useAuth` and from the week endpoint, which have them today.
 */

export const FEED_TABS = ['For You', 'Following', 'Communities'] as const;
export type FeedTab = (typeof FEED_TABS)[number];
