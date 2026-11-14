import { buildWarningMessages } from '../escalation/outbox-message';
import type { LinkState } from '../escalation/link';
import type {
  Acknowledgement,
  AsOf,
  Evaluation,
  Knowledge,
  OutboxMessage,
  Reading,
  RecommendationDecision,
} from '../health/model';
import { evaluate } from '../health/rule-engine/evaluate';
import type { HistorySource, MissionClock, RecordStore } from '../ports';

/** Everything a use-case needs from the outside. Built once per mode by the composition root. */
export interface Deps {
  store: RecordStore;
  clock: MissionClock;
  history: HistorySource;
  knowledge: Knowledge;
  seed: number;
  crewMember: string;
}

/** The in-memory working set. Immutable: every use-case returns a new one (or the same reference if unchanged). */
export interface Session {
  /** Regenerated from the seed; never stored. */
  synthetic: readonly Reading[];
  manual: readonly Reading[];
  acks: readonly Acknowledgement[];
  decisions: readonly RecommendationDecision[];
  outbox: readonly OutboxMessage[];
  evaluation: Evaluation;
}

export function currentAsOf(clock: MissionClock): AsOf {
  return { day: clock.today(), t: clock.now() };
}

export function evaluateSession(
  deps: Deps,
  parts: Pick<Session, 'synthetic' | 'manual' | 'acks'>,
): Evaluation {
  return evaluate(
    { readings: [...parts.synthetic, ...parts.manual], acks: parts.acks },
    deps.knowledge,
    currentAsOf(deps.clock),
  );
}

/**
 * Emits Earth-bound messages for active Warning findings: one per (zone, group). Idempotent: known
 * dedupe keys are skipped, and the store enforces it again with `putOutboxIfAbsent`.
 */
export async function emitWarnings(
  deps: Deps,
  evaluation: Evaluation,
  outbox: readonly OutboxMessage[],
  link: LinkState,
): Promise<readonly OutboxMessage[]> {
  const fresh = buildWarningMessages(evaluation, deps.knowledge.indicators, outbox, {
    crewMember: deps.crewMember,
    now: deps.clock.now(),
    link,
  });
  if (fresh.length === 0) return outbox;
  const stored: OutboxMessage[] = [];
  for (const message of fresh) {
    if (await deps.store.putOutboxIfAbsent(message)) stored.push(message);
  }
  return stored.length === 0 ? outbox : [...outbox, ...stored];
}

/** Re-derive the evaluation from the session parts and emit any new Warnings. */
export async function refresh(
  deps: Deps,
  parts: Pick<Session, 'synthetic' | 'manual' | 'acks' | 'decisions' | 'outbox'>,
  link: LinkState,
): Promise<Session> {
  const evaluation = evaluateSession(deps, parts);
  const outbox = await emitWarnings(deps, evaluation, parts.outbox, link);
  return { ...parts, outbox, evaluation };
}
