import { z } from 'zod';
import { FollowUpError } from './errors';

/** Most blocks one follow-up may carry. Extra blocks are cut, so a chatty model cannot flood the panel. */
export const MAX_BLOCKS = 5;

const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * The component catalog: every block the model may return. The model only chooses a `type` and fills its
 * fields; the app owns how each type is drawn. It never produces markup.
 */
export const BlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rationale'), text: text(400) }),
  z.object({
    type: z.literal('routine_change'),
    what: text(120),
    from: text(160),
    to: text(160),
    when: text(120),
  }),
  z.object({
    type: z.literal('new_habit'),
    name: text(100),
    frequency: text(80),
    timeOfDay: text(60),
    durationMinutes: z.number().int().min(1).max(240),
  }),
  z.object({ type: z.literal('schedule_slot'), time: text(40), activity: text(160) }),
  z.object({ type: z.literal('metric_target'), metric: text(80), target: z.number().finite(), unit: text(30) }),
]);

export type Block = z.infer<typeof BlockSchema>;
export type BlockType = Block['type'];

/** The shape the model must answer with. */
export const FollowUpResponseSchema = z.object({
  title: text(80),
  blocks: z.array(BlockSchema).min(1).max(MAX_BLOCKS),
});

export interface FollowUpSuggestion {
  title: string;
  blocks: Block[];
}

/** Rewrites `oneOf` to `anyOf` (the form providers accept) and drops `$schema`. */
function portable(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(portable);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === '$schema') continue;
      out[key === 'oneOf' ? 'anyOf' : key] = portable(value);
    }
    return out;
  }
  return node;
}

/** JSON Schema sent to the model, derived from the same schema that validates its answer. */
export function followUpJsonSchema(): Record<string, unknown> {
  return portable(z.toJSONSchema(FollowUpResponseSchema)) as Record<string, unknown>;
}

const Envelope = z.object({ title: text(80), blocks: z.array(z.unknown()) });

/**
 * Validates a model answer. A block that is unknown or malformed is dropped, not repaired; blocks beyond
 * MAX_BLOCKS are cut. It throws a `FollowUpError('invalid')` when the envelope is wrong or nothing survives.
 */
export function parseFollowUp(raw: unknown): FollowUpSuggestion {
  const envelope = Envelope.safeParse(raw);
  if (!envelope.success) throw new FollowUpError('invalid', 'The AI answer did not have the expected shape.');
  const blocks: Block[] = [];
  for (const candidate of envelope.data.blocks) {
    const parsed = BlockSchema.safeParse(candidate);
    if (parsed.success) blocks.push(parsed.data);
    if (blocks.length === MAX_BLOCKS) break;
  }
  if (blocks.length === 0) throw new FollowUpError('invalid', 'The AI answer had no usable blocks.');
  return { title: envelope.data.title, blocks };
}
