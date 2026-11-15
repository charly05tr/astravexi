import { useMemo } from 'react';
import { useAppContext, useAppState } from '../../app/app-context';
import { deriveHabitsView } from '../../core/habits/gamification';
import { can } from '../../core/profiles/policy';
import { Panel } from '../../ui/Panel';
import { useNotification } from '../../ui/notification';
import { announceHabitEvents } from './habit-events';
import { HabitsPanel } from './HabitsPanel';
import type { HabitActions } from './HabitsPanel';

/** "My habits": the astronaut's tracking view. Anyone who cannot manage habits sees it read-only. */
export function HabitsContainer() {
  const { store } = useAppContext();
  const notify = useNotification();
  const role = useAppState((s) => s.actor.role);
  const habitData = useAppState((s) => s.habitData);
  const today = useAppState((s) => s.mission.today);
  const view = useMemo(() => deriveHabitsView(habitData, today), [habitData, today]);

  const actions: HabitActions | undefined = can(role, 'manageHabits')
    ? {
        onToggle: (id) => void store.getState().toggleHabit(id).then((events) => announceHabitEvents(notify, events)),
        onArchive: (id, archived) => void store.getState().setHabitArchived(id, archived),
        onDelete: (id) => void store.getState().deleteHabit(id),
      }
    : undefined;

  return (
    <div className="habits-stage">
      <Panel
        title={actions ? 'My habits' : 'Habits'}
        id="habits"
        hint={`Mission day ${today}. Check a habit off once you have done it today. Everything stays on this device.`}
      >
        <HabitsPanel
          view={view}
          actions={actions}
          emptyText="No habits yet. Accept a recommendation, then tick the habits you want in the AI suggestion and choose Save selected habits."
        />
      </Panel>
    </div>
  );
}
