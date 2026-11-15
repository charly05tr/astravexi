import type { CabinAnalysisView } from '../../core/use-cases/cabin-analysis';
import { tierTheme } from '../../theme/tiers';
import { CAUSES, countItemsByVerdict, summarizeCabinNow } from './cabin-board-model';

const itemTotal = (view: CabinAnalysisView): number => {
  const counts = countItemsByVerdict(view);
  return CAUSES.reduce((n, c) => n + counts[c.verdict], 0);
};

/**
 * What a screen reader should hear when mission playback moves the cabin analysis from `before` to `after`: only a change of
 * the "Cabin now" tier, or more items to review. Nothing else, and nothing on the first view (`before` is null).
 */
export function cabinAnnouncement(before: CabinAnalysisView | null, after: CabinAnalysisView): string {
  if (!before) return '';
  const parts: string[] = [];
  const was = summarizeCabinNow(before).status;
  const now = summarizeCabinNow(after);
  if (was !== now.status) {
    parts.push(now.status === 'none' ? 'Cabin now back within limits.' : `Cabin now changed to ${tierTheme(now.status).label}.`);
  }
  const added = itemTotal(after) - itemTotal(before);
  if (added > 0) parts.push(`${added} new ${added === 1 ? 'item needs' : 'items need'} attention.`);
  return parts.join(' ');
}
