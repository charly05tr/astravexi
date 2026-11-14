import type { MissionDay, Rule } from '../model';
import type { EngineContext } from './context';
import { evalRuleAtDay } from './layers';

const MAX_LOOKBACK_DAYS = 120;

/**
 * Episode start of a sustained finding: the first day of the current unbroken run of days on which
 * the rule was active. Findings are keyed by episode (rule + first day), not by day, so a dismissal or
 * acknowledgement keeps pointing at the same finding while it persists.
 */
export function episodeStartDay(rule: Rule, ctx: EngineContext, day: MissionDay): MissionDay {
  let start = day;
  for (let steps = 0; steps < MAX_LOOKBACK_DAYS && start > 1; steps += 1) {
    if (!evalRuleAtDay(rule, ctx, start - 1)) break;
    start -= 1;
  }
  return start;
}
