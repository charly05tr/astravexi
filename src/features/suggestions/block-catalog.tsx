import { ArrowRight, Clock, Lightbulb, Repeat, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Block, BlockType } from '../../core/follow-up/blocks';

type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

/** Every component here is owned by the app. The model picks a type and fills fields; it never supplies markup. */
function Rationale({ block }: { block: BlockOf<'rationale'> }) {
  return (
    <p className="ai-block ai-block--rationale">
      <Lightbulb size={14} aria-hidden="true" />
      <span>{block.text}</span>
    </p>
  );
}

function RoutineChange({ block }: { block: BlockOf<'routine_change'> }) {
  return (
    <div className="ai-block ai-block--card">
      <p className="proposal__label">Routine change</p>
      <p className="ai-block__title">{block.what}</p>
      <p className="ai-block__shift">
        <span>{block.from}</span>
        <ArrowRight size={14} aria-label="to" />
        <strong>{block.to}</strong>
      </p>
      <p className="muted small">When: {block.when}</p>
    </div>
  );
}

function NewHabit({ block }: { block: BlockOf<'new_habit'> }) {
  return (
    <div className="ai-block ai-block--card">
      <p className="proposal__label">
        <Repeat size={12} aria-hidden="true" /> New habit
      </p>
      <p className="ai-block__title">{block.name}</p>
      <dl className="ai-block__facts">
        <div>
          <dt>How often</dt>
          <dd>{block.frequency}</dd>
        </div>
        <div>
          <dt>Time of day</dt>
          <dd>{block.timeOfDay}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{block.durationMinutes} min</dd>
        </div>
      </dl>
    </div>
  );
}

function ScheduleSlot({ block }: { block: BlockOf<'schedule_slot'> }) {
  return (
    <p className="ai-block ai-block--slot">
      <Clock size={14} aria-hidden="true" />
      <strong>{block.time}</strong>
      <span>{block.activity}</span>
    </p>
  );
}

function MetricTarget({ block }: { block: BlockOf<'metric_target'> }) {
  return (
    <p className="ai-block ai-block--slot">
      <Target size={14} aria-hidden="true" />
      <span>{block.metric}</span>
      <strong>
        {block.target} {block.unit}
      </strong>
    </p>
  );
}

type Catalog = { [T in BlockType]: (props: { block: BlockOf<T> }) => ReactNode };

export const BLOCK_CATALOG: Catalog = {
  rationale: Rationale,
  routine_change: RoutineChange,
  new_habit: NewHabit,
  schedule_slot: ScheduleSlot,
  metric_target: MetricTarget,
};

/** Maps one validated block to its component. A type the catalog does not know renders nothing. */
export function BlockView({ block }: { block: Block }) {
  const Component = (BLOCK_CATALOG as Record<string, ((props: { block: Block }) => ReactNode) | undefined>)[block.type];
  return Component ? <Component block={block} /> : null;
}
