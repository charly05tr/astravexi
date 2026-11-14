import type { MissionDay, MissionMinute } from '../../core/health/model';
import type { MissionClock } from '../../core/ports';
import { DEMO_CLOCK_START_OFFSET_MIN, DEMO_DAY } from '../seeded-history';

const MINUTES_PER_DAY = 1440;

/** The persisted position: the frozen day and the link-time minute at the moment it was saved. */
export interface DemoClockPosition {
  day: MissionDay;
  minute: MissionMinute;
}

export const dayStartMinute = (day: MissionDay): MissionMinute => (day - 1) * MINUTES_PER_DAY + DEMO_CLOCK_START_OFFSET_MIN;

export const DEMO_CLOCK_START: DemoClockPosition = { day: DEMO_DAY, minute: dayStartMinute(DEMO_DAY) };

/**
 * DEMO clock. The mission day is FROZEN: it never derives from the minute counter, so it cannot cross
 * midnight on its own. Only `advanceDay` and `reset` move it. The link time is a separate counter at
 * 1 real second = 1 mission minute.
 *
 * Constructing it from a saved position re-anchors it to the current real time, so time does not
 * pass while the tab is closed.
 */
export class DemoClock implements MissionClock {
  readonly scaleLabel = '1 s = 1 min';
  private day: MissionDay;
  private anchorMinute: MissionMinute;
  private anchorRealMs: number;
  private readonly nowMs: () => number;

  constructor(position: DemoClockPosition = DEMO_CLOCK_START, nowMs: () => number = Date.now) {
    this.nowMs = nowMs;
    this.day = position.day;
    this.anchorMinute = position.minute;
    this.anchorRealMs = nowMs();
  }

  today(): MissionDay {
    return this.day;
  }

  now(): MissionMinute {
    return this.anchorMinute + Math.max(0, Math.floor((this.nowMs() - this.anchorRealMs) / 1000));
  }

  /** What to persist: the frozen day and the current link minute. */
  position(): DemoClockPosition {
    return { day: this.day, minute: this.now() };
  }

  /** The day moves by one; the link minute never goes backwards and is at least 08:00 of the new day. */
  advanceDay(): void {
    const current = this.now();
    this.day += 1;
    this.anchorMinute = Math.max(current, dayStartMinute(this.day));
    this.anchorRealMs = this.nowMs();
  }

  /** Back to day 150, 08:00. */
  reset(): void {
    this.day = DEMO_CLOCK_START.day;
    this.anchorMinute = DEMO_CLOCK_START.minute;
    this.anchorRealMs = this.nowMs();
  }
}
