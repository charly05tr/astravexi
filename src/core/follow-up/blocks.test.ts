import { describe, expect, it } from 'vitest';
import { FollowUpError } from './errors';
import { MAX_BLOCKS, followUpJsonSchema, parseFollowUp } from './blocks';

const rationale = { type: 'rationale', text: 'Short, regular sleep helps your readings recover.' };
const habit = { type: 'new_habit', name: 'Evening wind-down', frequency: 'Daily', timeOfDay: 'Before sleep', durationMinutes: 15 };

describe('parseFollowUp', () => {
  it('accepts every block type in the catalog', () => {
    const out = parseFollowUp({
      title: 'Build on your sleep change',
      blocks: [
        rationale,
        { type: 'routine_change', what: 'Lights-out time', from: '23:30', to: '22:45', when: 'Starting tonight' },
        habit,
        { type: 'schedule_slot', time: '21:30', activity: 'Dim the cabin lights' },
        { type: 'metric_target', metric: 'Sleep', target: 7.5, unit: 'h' },
      ],
    });
    expect(out.title).toBe('Build on your sleep change');
    expect(out.blocks.map((b) => b.type)).toEqual([
      'rationale',
      'routine_change',
      'new_habit',
      'schedule_slot',
      'metric_target',
    ]);
  });

  it('drops unknown block types and keeps the rest', () => {
    const out = parseFollowUp({
      title: 'Idea',
      blocks: [{ type: 'html', markup: '<script>alert(1)</script>' }, rationale],
    });
    expect(out.blocks).toEqual([rationale]);
  });

  it('drops a known block whose fields are invalid', () => {
    const out = parseFollowUp({ title: 'Idea', blocks: [{ ...habit, durationMinutes: -5 }, rationale] });
    expect(out.blocks).toEqual([rationale]);
  });

  it('cuts blocks beyond the maximum', () => {
    const blocks = Array.from({ length: MAX_BLOCKS + 3 }, (_, i) => ({ ...rationale, text: `Point ${i}` }));
    expect(parseFollowUp({ title: 'Long', blocks }).blocks).toHaveLength(MAX_BLOCKS);
  });

  it('rejects a bad envelope and an answer with no usable block', () => {
    for (const raw of [null, 'text', { blocks: [rationale] }, { title: '', blocks: [rationale] }, { title: 'x', blocks: 'no' }]) {
      expect(() => parseFollowUp(raw)).toThrow(FollowUpError);
    }
    expect(() => parseFollowUp({ title: 'x', blocks: [{ type: 'nope' }] })).toThrow(/no usable blocks/);
  });

  it('rejects an oversize title', () => {
    expect(() => parseFollowUp({ title: 'x'.repeat(81), blocks: [rationale] })).toThrow(FollowUpError);
  });
});

describe('followUpJsonSchema', () => {
  it('describes the catalog without $schema or oneOf, and caps the block count', () => {
    const schema = followUpJsonSchema();
    const text = JSON.stringify(schema);
    expect(schema).not.toHaveProperty('$schema');
    expect(text).not.toContain('oneOf');
    expect(text).toContain('anyOf');
    for (const type of ['rationale', 'routine_change', 'new_habit', 'schedule_slot', 'metric_target']) {
      expect(text).toContain(`"${type}"`);
    }
    const blocks = (schema.properties as Record<string, { maxItems?: number }>).blocks!;
    expect(blocks.maxItems).toBe(MAX_BLOCKS);
  });
});
