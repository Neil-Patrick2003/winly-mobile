/**
 * How long ago something happened, at a glance.
 *
 * Shared rather than owned by the feed card, because a post and a comment sit
 * next to each other in the same conversation — two different shortenings of
 * the same interval would read as two different clocks.
 *
 * Deliberately coarse: past a month the exact interval stops being the useful
 * fact and the date itself takes over.
 */
export function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';

  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m`;

  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h`;

  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)}d`;

  const weeks = days / 7;
  if (weeks < 5) return `${Math.floor(weeks)}w`;

  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
