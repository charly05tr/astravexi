import { Allow, parse as parsePartialJson } from 'partial-json';
import { BlockSchema, MAX_BLOCKS } from './blocks';
import type { Block } from './blocks';

/** What can be shown while the model is still writing: only parts that are finished and valid. */
export interface PartialFollowUp {
  title: string | null;
  blocks: Block[];
}

/** Complete `{...}` objects of the `blocks` array, in order. A half-written object is never returned. */
function completeObjects(text: string): unknown[] {
  const key = text.indexOf('"blocks"');
  if (key === -1) return [];
  const open = text.indexOf('[', key);
  if (open === -1) return [];

  const found: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = open + 1; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        try {
          found.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          // Not valid JSON after all: skip it.
        }
        start = -1;
      }
    } else if (ch === ']' && depth === 0) break;
  }
  return found;
}

/**
 * Reads the text the model has produced so far. The title comes from a tolerant partial-JSON parse, and only
 * once the `blocks` key has started (so it is complete). Blocks are taken only when their object is closed
 * and passes the same schema as the final answer; anything else waits for more text.
 */
export function partialFollowUp(text: string): PartialFollowUp {
  const blocks: Block[] = [];
  for (const candidate of completeObjects(text)) {
    const parsed = BlockSchema.safeParse(candidate);
    if (parsed.success) blocks.push(parsed.data);
    if (blocks.length === MAX_BLOCKS) break;
  }

  let title: string | null = null;
  const titleAt = text.indexOf('"title"');
  const blocksAt = text.indexOf('"blocks"');
  if (titleAt !== -1 && blocksAt > titleAt) {
    try {
      // No Allow.NUM: this only ever reads strings, objects and arrays.
      const value: unknown = parsePartialJson(text, Allow.STR | Allow.OBJ | Allow.ARR);
      const candidate = (value as { title?: unknown } | null)?.title;
      if (typeof candidate === 'string' && candidate.trim() !== '') title = candidate.trim().slice(0, 80);
    } catch {
      // Not parsable yet.
    }
  }
  return { title, blocks };
}
