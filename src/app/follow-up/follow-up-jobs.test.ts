import { describe, expect, it, vi } from 'vitest';
import type { FollowUpSuggestionProvider } from '../../core/ports';
import { createFollowUpJobs } from './follow-up-jobs';

const provider = (): FollowUpSuggestionProvider & { suggest: ReturnType<typeof vi.fn<FollowUpSuggestionProvider['suggest']>> } => ({
  id: 'fake',
  isConfigured: () => true,
  subscribe: () => () => undefined,
  suggest: vi.fn<FollowUpSuggestionProvider['suggest']>(),
});

describe('follow-up jobs: skip', () => {
  it('records a reason, opens it for viewing, makes no request and raises no toast', () => {
    const p = provider();
    const jobs = createFollowUpJobs(p);
    jobs.getState().skip('rec-1', 'Not sent: private readings.');
    expect(p.suggest).not.toHaveBeenCalled();
    expect(jobs.getState().viewingId).toBe('rec-1');
    expect(jobs.getState().jobs['rec-1']).toMatchObject({ status: 'failed', message: 'Not sent: private readings.', notified: true });
    // A later start for the same recommendation is ignored: the decision stands.
    jobs.getState().start('rec-1', {} as never);
    expect(p.suggest).not.toHaveBeenCalled();
  });
});
