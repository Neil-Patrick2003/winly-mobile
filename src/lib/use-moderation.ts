import { router } from 'expo-router';
import { useCallback } from 'react';

import { useAuth } from '@/lib/auth-context';
import { useConfirm } from '@/lib/confirm';
import { useFeed } from '@/lib/feed-context';
import { blockUser, type ReportType } from '@/lib/moderation';
import { useToast } from '@/lib/toast';

/** The person behind whatever is being reported, so the report can offer to block them. */
export type ReportAuthor = { id: string; name: string };

/**
 * Report and block, the same way from every screen that offers them: posts,
 * comments, stories and profiles.
 */
export function useModeration() {
  const { token } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();
  const { refresh } = useFeed();

  /** Open the report sheet for one post, comment, story or person. */
  const report = useCallback((type: ReportType, id: string, author?: ReportAuthor) => {
    router.push({
      pathname: '/report',
      params: { type, id, authorId: author?.id ?? '', authorName: author?.name ?? '' },
    });
  }, []);

  /**
   * Ask, then block. Resolves true once they are blocked.
   *
   * The feed is reloaded afterwards, since everything of theirs already on
   * screen was fetched before the block existed.
   */
  const block = useCallback(
    async (person: ReportAuthor) => {
      if (!token) return false;

      const confirmed = await confirm({
        title: `Block ${person.name}?`,
        message:
          "You won't see each other's posts, comments or stories, and any follows between you are removed. They won't be told.",
        confirmLabel: 'Block',
        destructive: true,
      });
      if (!confirmed) return false;

      try {
        await blockUser(person.id, token);
        showToast(`Blocked ${person.name}`);
        void refresh();
        return true;
      } catch (caught) {
        showToast(caught instanceof Error ? caught.message : 'Could not block them. Try again.');
        return false;
      }
    },
    [token, confirm, showToast, refresh]
  );

  return { report, block };
}
