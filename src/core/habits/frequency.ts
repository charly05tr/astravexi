import type { HabitFrequency } from './model';

const DAILY: HabitFrequency = { kind: 'daily' };

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  once: 1,
  two: 2,
  twice: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
};

const WEEKDAY = /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?s?\b/g;

const weekly = (times: number): HabitFrequency =>
  times >= 7 ? DAILY : times < 1 ? DAILY : { kind: 'weekly', times: Math.floor(times) };

/**
 * Turns the AI's free-text frequency ("3 times a week", "every morning", "Mon, Wed, Fri") into a structured one.
 * Anything it cannot read safely becomes daily, so a habit is never silently made easier than intended by a
 * guess; seven or more times a week is daily.
 */
export function normalizeFrequency(text: string): HabitFrequency {
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return DAILY;

  // "N times a day" is still a daily habit, whatever N is.
  if (/\b(?:\d+|one|two|three|four|five|six|seven|once|twice)\s*(?:x|times?)?\s*(?:a|per|each|\/)\s*day\b/.test(t)) return DAILY;

  const numeric = t.match(/\b(\d+)\s*(?:x|times?)\s*(?:(?:a|per|each|every|\/)\s*(?:week|wk)|weekly)\b/);
  if (numeric) return weekly(Number(numeric[1]));
  const slashed = t.match(/\b(\d+)\s*\/\s*(?:week|wk)\b/);
  if (slashed) return weekly(Number(slashed[1]));
  const worded = t.match(
    /\b(one|two|three|four|five|six|seven|once|twice)\s*(?:times?\s*)?(?:(?:a|per|each|every)\s*(?:week|wk)|weekly)\b/,
  );
  if (worded) return weekly(NUMBER_WORDS[worded[1]!]!);

  if (/\bweekdays\b|\bmon(?:day)?\s*(?:to|through|-|–)\s*fri(?:day)?\b/.test(t)) return weekly(5);
  if (/\bweekends?\b/.test(t)) return weekly(2);
  if (/\bevery other day\b|\balternate days\b/.test(t)) return weekly(3);

  if (/\b(daily|every ?day|each day|nightly|every (?:morning|evening|night|afternoon))\b/.test(t)) return DAILY;

  const days = new Set([...t.matchAll(WEEKDAY)].map((m) => m[1]!.slice(0, 3)));
  // One stray "sun" must not read as a schedule: a single day counts only as "every <full day name>".
  if (days.size >= 2) return weekly(days.size);
  if (/\bevery\s+(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/.test(t)) return weekly(1);

  if (/\b(weekly|every week|once a week)\b/.test(t)) return weekly(1);
  return DAILY;
}

/** "Daily" or "3 times a week", for display. */
export function frequencyLabel(frequency: HabitFrequency): string {
  if (frequency.kind === 'daily') return 'Every day';
  return frequency.times === 1 ? 'Once a week' : `${frequency.times} times a week`;
}
