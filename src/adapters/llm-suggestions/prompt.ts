import { followUpJsonSchema } from '../../core/follow-up/blocks';
import type { FollowUpContext } from '../../core/ports';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/** The system prompt always carries the schema too, so a server without json_schema support still sees it. */
export function buildMessages(context: FollowUpContext): ChatMessage[] {
  const system = [
    'You are a health-routine assistant inside a monitoring app for astronauts on a long mission.',
    'The astronaut just accepted a recommendation. Propose ONE follow-up that builds on it: either a change to their routine or a new habit.',
    'Rules:',
    '- You only propose. You never diagnose, never prescribe medication and never change or contradict the alert tiers.',
    '- Use only the context you are given. Do not invent readings or findings.',
    '- Keep it small, concrete and safe for a confined spacecraft. If unsure, suggest talking to the crew medical officer.',
    '- Answer with a single JSON object and nothing else: no markdown, no code fences, no HTML.',
    `- Use between 1 and 5 blocks. Allowed block types and fields are defined by this JSON Schema: ${JSON.stringify(followUpJsonSchema())}`,
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(context) },
  ];
}
