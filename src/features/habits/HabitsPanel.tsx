import { Archive, ArchiveRestore, CalendarCheck, Check, CircleCheck, Flame, Sprout, Trash2, Trophy } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { frequencyLabel } from '../../core/habits/frequency';
import type { BadgeDefinition, HabitView, HabitsView } from '../../core/habits/gamification';
import type { BadgeId } from '../../core/habits/model';
import { Button } from '../../ui/Button';

const BADGE_ICON: Record<BadgeId, ReactNode> = {
  first_habit: <Sprout size={18} aria-hidden="true" />,
  first_completion: <CircleCheck size={18} aria-hidden="true" />,
  streak_7: <Flame size={18} aria-hidden="true" />,
  perfect_week: <CalendarCheck size={18} aria-hidden="true" />,
};

export interface HabitActions {
  onToggle(habitId: string): void;
  onArchive(habitId: string, archived: boolean): void;
  onDelete(habitId: string): void;
}

/** Level, points, the bar to the next level and the badges. */
export function ProgressHeader({ view }: { view: HabitsView }) {
  const { progress } = view;
  const next = progress.nextLevelAt;
  const percent = Math.round(progress.fraction * 100);
  return (
    <section className="habit-progress" aria-label="Your progress">
      <div className="habit-progress__level">
        <Trophy size={20} aria-hidden="true" />
        <div>
          <p className="habit-progress__label">Level</p>
          <p className="habit-progress__value" data-testid="habit-level">
            {progress.level}
          </p>
        </div>
        <div>
          <p className="habit-progress__label">Points</p>
          <p className="habit-progress__value" data-testid="habit-points">
            {progress.points}
          </p>
        </div>
      </div>
      <div className="habit-progress__bar">
        <div
          role="progressbar"
          className="meter"
          aria-label="Progress to the next level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={next === null ? 'Top level reached' : `${progress.points - progress.levelStart} of ${next - progress.levelStart} points`}
        >
          <div className="meter__fill" style={{ width: `${percent}%` }} />
        </div>
        <p className="muted small">{next === null ? 'Top level reached.' : `${next - progress.points} points to level ${progress.level + 1}.`}</p>
      </div>
      <ul className="badge-list" aria-label="Badges">
        {view.badges.map((b) => (
          <BadgeItem key={b.id} badge={b} />
        ))}
      </ul>
    </section>
  );
}

function BadgeItem({ badge }: { badge: BadgeDefinition & { earned: boolean; unlockedDay: number | null } }) {
  return (
    <li className="badge-item" data-earned={badge.earned} title={badge.description}>
      {BADGE_ICON[badge.id]}
      <span>
        <strong>{badge.label}</strong>
        <span className="sr-only">{badge.earned ? ' (earned)' : ' (not earned yet)'}</span>
        <span className="badge-item__note" aria-hidden="true">
          {badge.earned ? `Day ${badge.unlockedDay}` : 'Locked'}
        </span>
      </span>
    </li>
  );
}

function streakText(view: HabitView): string {
  const { current, best, unit } = view.streak;
  const plural = (n: number) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  return current === 0 ? `No streak yet. Best: ${plural(best)}` : `${plural(current)} streak. Best: ${plural(best)}`;
}

function HabitRow({ view, actions, archived }: { view: HabitView; actions?: HabitActions; archived?: boolean }) {
  const { habit } = view;
  const [confirming, setConfirming] = useState(false);
  const meta = [frequencyLabel(habit.frequency), habit.timeOfDay, habit.durationMinutes ? `${habit.durationMinutes} min` : null].filter(Boolean);
  return (
    <li className="habit" data-habit-id={habit.id} data-done={view.doneToday}>
      <div className="habit__main">
        {actions && !archived ? (
          <button
            type="button"
            className="habit__check"
            aria-pressed={view.doneToday}
            aria-label={`Done today: ${habit.name}`}
            onClick={() => actions.onToggle(habit.id)}
          >
            {view.doneToday ? <Check size={18} aria-hidden="true" /> : null}
          </button>
        ) : (
          <span className="habit__state" role="img" aria-label={view.doneToday ? 'Done today' : 'Not done today'}>
            {view.doneToday ? <Check size={16} aria-hidden="true" /> : null}
          </span>
        )}
        <div className="habit__text">
          <p className="habit__name">{habit.name}</p>
          <p className="muted small">{meta.join(' · ')}</p>
          {habit.note ? <p className="muted small">{habit.note}</p> : null}
          <p className="habit__streak">
            <Flame size={14} aria-hidden="true" />
            <span>{streakText(view)}</span>
          </p>
          <p className="muted small">
            {view.weekDone} of {view.weekTarget} this week
          </p>
          <ol className="habit-week" aria-label="This week">
            {view.week.map((d) => (
              <li key={d.day} className="habit-week__day" data-done={d.done} data-today={d.isToday} data-future={d.future}>
                <span className="sr-only">{`Day ${d.day}${d.isToday ? ' (today)' : ''}: ${d.done ? 'done' : d.future ? 'upcoming' : 'not done'}`}</span>
              </li>
            ))}
          </ol>
          <p className="muted small habit__origin">From an AI suggestion · {habit.origin.model}</p>
        </div>
      </div>
      {actions ? (
        <div className="habit__actions">
          {confirming ? (
            <>
              <span className="small" role="alert">
                Delete this habit and its history?
              </span>
              <Button size="small" onClick={() => actions.onDelete(habit.id)}>
                Confirm delete
              </Button>
              <Button size="small" onClick={() => setConfirming(false)}>
                Keep
              </Button>
            </>
          ) : (
            <>
              <Button size="small" onClick={() => actions.onArchive(habit.id, !archived)} aria-label={`${archived ? 'Restore' : 'Archive'} ${habit.name}`}>
                {archived ? <ArchiveRestore size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
                {archived ? 'Restore' : 'Archive'}
              </Button>
              <Button size="small" onClick={() => setConfirming(true)} aria-label={`Delete ${habit.name}`}>
                <Trash2 size={14} aria-hidden="true" />
                Delete
              </Button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Progress header and the habit list. Presentational: `actions` is absent for a read-only reader (the CMO), who
 * sees the same numbers without any control to change them.
 */
export function HabitsPanel({ view, actions, emptyText }: { view: HabitsView; actions?: HabitActions; emptyText: string }) {
  return (
    <div className="habits">
      <ProgressHeader view={view} />
      {view.active.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <ul className="habit-list" aria-label="Active habits">
          {view.active.map((h) => (
            <HabitRow key={h.habit.id} view={h} actions={actions} />
          ))}
        </ul>
      )}
      {view.archived.length > 0 ? (
        <details className="habit-archive">
          <summary>Archived habits ({view.archived.length})</summary>
          <ul className="habit-list" aria-label="Archived habits">
            {view.archived.map((h) => (
              <HabitRow key={h.habit.id} view={h} actions={actions} archived />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
