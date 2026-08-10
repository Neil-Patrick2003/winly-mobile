import { apiGet } from '@/lib/api';

/**
 * A run of content inside a section.
 *
 * Mirrors the block types in the backend's `config/legal-documents.php`. A new
 * type added there and not handled by the screen is dropped silently rather
 * than crashing — a clause vanishing from a policy is bad, but a sign-up screen
 * that cannot render is worse.
 */
export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  /** An emphasised group; the first paragraph is the point, the rest explain it. */
  | { type: 'callout'; text: string[] };

export type LegalSection = {
  heading: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  /** `terms` or `privacy`. */
  key: string;
  title: string;
  /** Already formatted for display — "7 August 2026". */
  updated_at: string;
  sections: LegalSection[];
};

/**
 * GET /api/v1/legal — both documents, in reading order.
 *
 * Unauthenticated, because the screen that shows it is reached from sign-up:
 * nobody has an account at the moment they are deciding whether to agree.
 *
 * Fetched rather than bundled so the wording can be corrected without shipping
 * a release, and so the app and the public web pages — the ones App Store
 * Connect is given — cannot drift into saying different things.
 */
export async function fetchLegalDocuments() {
  const response = await apiGet<{ data: LegalDocument[] }>('/api/v1/legal');
  return response.data;
}
