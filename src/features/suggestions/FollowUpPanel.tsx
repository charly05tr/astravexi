import { CircleCheck, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import type { Block } from '../../core/follow-up/blocks';
import { habitBlockName, habitSourceKey, isHabitBlock } from '../../core/habits/from-blocks';
import type { HabitBlock } from '../../core/habits/from-blocks';
import { Dialog } from '../../ui/Dialog';
import { Button } from '../../ui/Button';
import { BlockView } from './block-catalog';
import type { FollowUpJob } from '../../app/follow-up/follow-up-jobs';

/** One quiet line under an accepted recommendation when no AI is set up. Never opens a modal. */
export function FollowUpHint({ onDismiss, onConfigure }: { onDismiss(): void; onConfigure(): void }) {
  return (
    <div className="ai-note">
      <p className="muted small">
        Want a follow-up built on this change?{' '}
        <button type="button" className="link-button" onClick={onConfigure}>
          Set up the AI assistant
        </button>
      </p>
      <button type="button" className="link-button muted small" onClick={onDismiss}>
        Hide
      </button>
    </div>
  );
}

/** What the result modal needs to let the astronaut keep suggested habits. Absent for roles that cannot manage habits. */
export interface HabitSaving {
  /** Source keys of habits already saved (any state), so a block is never offered twice. */
  savedKeys: ReadonlySet<string>;
  onSave(blocks: HabitBlock[]): void | Promise<void>;
}

const BLOCK_NOUN: Record<HabitBlock['type'], string> = { new_habit: 'habit', routine_change: 'routine change' };

/** The generated blocks. Habit-like blocks get a checkbox; "Save selected habits" keeps the ticked ones. */
function ResultBlocks({ recommendationId, blocks, saving }: { recommendationId: string; blocks: readonly Block[]; saving?: HabitSaving }) {
  const groupId = useId();
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const toggle = (index: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  const save = async () => {
    if (!saving || busy) return;
    const chosen = blocks.filter((b, i): b is HabitBlock => selected.has(i) && isHabitBlock(b));
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      await saving.onSave(chosen);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };
  const selectable = saving ? blocks.some(isHabitBlock) : false;
  return (
    <>
      <div className="ai-panel__blocks">
        {blocks.map((block, i) => {
          if (!saving || !isHabitBlock(block)) return <BlockView key={i} block={block} />;
          const saved = saving.savedKeys.has(habitSourceKey(recommendationId, block));
          const id = `${groupId}-${i}`;
          return (
            <div key={i} className="ai-select" data-saved={saved || undefined}>
              <input
                id={id}
                type="checkbox"
                className="ai-select__box"
                checked={saved || selected.has(i)}
                disabled={saved || busy}
                onChange={() => toggle(i)}
                aria-label={`Select ${BLOCK_NOUN[block.type]}: ${habitBlockName(block)}`}
              />
              <div className="ai-select__body">
                <BlockView block={block} />
                {saved ? (
                  <p className="status-line ai-select__saved">
                    <CircleCheck size={14} aria-hidden="true" />
                    Saved to My habits
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {selectable ? (
        <div className="proposal__actions">
          <Button size="small" variant="primary" disabled={selected.size === 0 || busy} onClick={() => void save()}>
            Save selected habits
          </Button>
        </div>
      ) : null}
    </>
  );
}

/**
 * The AI follow-up in a modal, for one job. While it runs: a spinner and "Continue in background" (the request
 * keeps going and a toast announces the result). When done: the generated blocks, or a quiet failure message.
 * Always labelled as AI-generated.
 */
export function FollowUpDialog({
  job,
  onClose,
  onConfigure,
  habitSaving,
}: {
  job: Exclude<FollowUpJob, { status: 'unconfigured' }>;
  /** Lets the astronaut tick habit blocks and save them. */
  habitSaving?: HabitSaving;
  /** For a running job this only hides the modal; for a finished one it also discards the result. */
  onClose(): void;
  onConfigure(): void;
}) {
  const processing = job.status === 'processing';
  return (
    <Dialog
      title={job.status === 'ready' ? job.suggestion.title : 'AI suggestion'}
      eyebrow={
        <span className="ai-panel__eyebrow">
          <Sparkles size={12} aria-hidden="true" /> AI suggestion
        </span>
      }
      closeLabel={processing ? 'Continue in background' : 'Close AI suggestion'}
      onClose={onClose}
      style={{ width: 'min(560px, 92vw)' }}
    >
      <div className="ai-panel" aria-busy={processing}>
        {job.status === 'processing' ? (
          <>
            <div className="ai-panel__working" role="status">
              <span className="spinner" aria-hidden="true" />
              <p>Generating your AI suggestion. This usually takes a few seconds.</p>
            </div>
            {job.partial && (job.partial.title || job.partial.blocks.length > 0) ? (
              <div className="ai-panel__blocks" aria-label="Suggestion so far">
                {job.partial.title ? <p className="proposal__title">{job.partial.title}</p> : null}
                {job.partial.blocks.map((block, i) => (
                  <BlockView key={i} block={block} />
                ))}
              </div>
            ) : null}
            <p className="muted small">You can keep using the app. We will let you know when it is ready.</p>
            <div className="proposal__actions">
              <Button size="small" onClick={onClose}>
                Continue in background
              </Button>
            </div>
          </>
        ) : null}

        {job.status === 'failed' ? (
          <>
            <p role="status">AI suggestion unavailable: {job.message} The change you accepted still stands.</p>
            <div className="proposal__actions">
              <Button size="small" onClick={onConfigure}>
                Open AI assistant settings
              </Button>
              <Button size="small" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        ) : null}

        {job.status === 'ready' ? (
          <>
            <ResultBlocks recommendationId={job.id} blocks={job.suggestion.blocks} saving={habitSaving} />
            <p className="muted small">Generated by AI as an optional idea. Your alerts and thresholds are not affected.</p>
            <div className="proposal__actions">
              <Button size="small" variant="primary" onClick={onClose}>
                Dismiss
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
