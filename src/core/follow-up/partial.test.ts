import { describe, expect, it } from 'vitest';
import { partialFollowUp } from './partial';

const FULL =
  '{"title":"Wind down earlier","blocks":[{"type":"rationale","text":"A steady evening helps."},' +
  '{"type":"new_habit","name":"Wind-down","frequency":"Daily","timeOfDay":"Evening","durationMinutes":15}]}';

describe('partialFollowUp', () => {
  it('returns nothing until something is finished', () => {
    expect(partialFollowUp('')).toEqual({ title: null, blocks: [] });
    expect(partialFollowUp('{"title":"Wind do')).toEqual({ title: null, blocks: [] });
  });

  it('shows the title only once the blocks key has started', () => {
    expect(partialFollowUp('{"title":"Wind down earlier","blocks":[').title).toBe('Wind down earlier');
  });

  it('never returns a half-written block, even one that would already pass the schema', () => {
    // The text is cut mid-string: schema-wise it would be valid ("A steady even"), so only completeness keeps it out.
    const cut = FULL.slice(0, FULL.indexOf('A steady evening') + 13);
    expect(partialFollowUp(cut).blocks).toEqual([]);
  });

  it('adds blocks one at a time as their objects close', () => {
    const firstEnd = FULL.indexOf('helps."}') + 'helps."}'.length;
    expect(partialFollowUp(FULL.slice(0, firstEnd)).blocks.map((b) => b.type)).toEqual(['rationale']);
    expect(partialFollowUp(FULL.slice(0, FULL.length - 3)).blocks.map((b) => b.type)).toEqual(['rationale']);
    expect(partialFollowUp(FULL).blocks.map((b) => b.type)).toEqual(['rationale', 'new_habit']);
  });

  it('drops unknown or invalid blocks and handles braces inside strings', () => {
    const text =
      '{"title":"T","blocks":[{"type":"html","x":"<b>"},{"type":"rationale","text":"has } and { and \\" inside"},{"type":"new_habit","name":"n","frequency":"f","timeOfDay":"t","durationMinutes":0}]}';
    const out = partialFollowUp(text);
    expect(out.blocks).toEqual([{ type: 'rationale', text: 'has } and { and " inside' }]);
  });
});
