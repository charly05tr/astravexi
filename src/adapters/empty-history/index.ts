import type { HistorySource } from '../../core/ports';

/** LIVE mode: no synthetic data, ever. */
export const emptyHistory: HistorySource = {
  generate: () => [],
};
