import type { MissionDay, MissionMinute } from '../../core/health/model';
import type { MissionClock } from '../../core/ports';
import { dayStartMinute } from '../demo-clock';

const MINUTES_PER_DAY = 1440;

/**
 * The clock of a DEMO scenario under playback. It does not follow real time: the playback controller sets it, so the
 * mission minute (and the day, which here DOES follow the minute) is the same for every view until the next commit.
 */
export class ScenarioClock implements MissionClock {
  readonly scaleLabel = 'playback';
  private t: MissionMinute;
  private readonly resetMinute: MissionMinute;
  private readonly listeners = new Set<() => void>();

  constructor(startMinute: MissionMinute, resetMinute: MissionMinute = startMinute) {
    this.t = startMinute;
    this.resetMinute = resetMinute;
  }

  today(): MissionDay {
    return Math.floor(this.t / MINUTES_PER_DAY) + 1;
  }

  now(): MissionMinute {
    return this.t;
  }

  /** Moves the clock without notifying: the controller that calls it re-evaluates the app itself. */
  setNow(minute: MissionMinute): void {
    this.t = Math.max(0, Math.floor(minute));
  }

  position(): { day: MissionDay; minute: MissionMinute } {
    return { day: this.today(), minute: this.t };
  }

  /** "Advance one day": 08:00 of the next day (never backwards). */
  advanceDay(): void {
    this.t = Math.max(this.t, dayStartMinute(this.today() + 1));
    this.emit();
  }

  /** "Reset demo": back to where the scenario started. */
  reset(): void {
    this.t = this.resetMinute;
    this.emit();
  }

  /** Called when the clock was moved from outside the controller (advance one day, reset). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
