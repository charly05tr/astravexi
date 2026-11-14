import type { MissionDay, MissionMinute } from '../../core/health/model';
import type { MissionClock } from '../../core/ports';

export interface MissionConfig {
  /** Local calendar date, `YYYY-MM-DD`. */
  launchDate: string;
  transitDays: number;
  destination: string;
}

export const DEFAULT_TRANSIT_DAYS = 210;
export const DEFAULT_DESTINATION = 'Mars';
const MINUTES_PER_DAY = 1440;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` of a timestamp in the LOCAL time zone. */
export function localDateString(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function defaultMissionConfig(nowMs: number): MissionConfig {
  return { launchDate: localDateString(nowMs), transitDays: DEFAULT_TRANSIT_DAYS, destination: DEFAULT_DESTINATION };
}

/** Whole calendar days between two `YYYY-MM-DD` dates, independent of DST. */
function calendarDiffDays(fromDate: string, toDate: string): number {
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((parse(toDate) - parse(fromDate)) / 86_400_000);
}

/**
 * LIVE clock. Mission day = local calendar-date difference from the launch date + 1, clamped to at least 1
 * (a future launch date reads as Day 1). Minutes are counted from the start of that local day, so
 * `now()` always lies inside `today()` even across a DST change.
 */
export class WallClock implements MissionClock {
  readonly scaleLabel = 'real minutes';
  private config: MissionConfig;
  private readonly nowMs: () => number;

  constructor(config: MissionConfig, nowMs: () => number = Date.now) {
    this.config = config;
    this.nowMs = nowMs;
  }

  getConfig(): MissionConfig {
    return this.config;
  }

  configure(config: MissionConfig): void {
    this.config = config;
  }

  today(): MissionDay {
    const diff = calendarDiffDays(this.config.launchDate, localDateString(this.nowMs()));
    return Math.max(1, diff + 1);
  }

  now(): MissionMinute {
    const d = new Date(this.nowMs());
    return (this.today() - 1) * MINUTES_PER_DAY + d.getHours() * 60 + d.getMinutes();
  }
}
