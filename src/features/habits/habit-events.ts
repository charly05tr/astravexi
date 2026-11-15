import type { HabitEvent } from '../../core/use-cases/habits';
import type { NotificationOptions, NotificationVariant } from '../../ui/notification/types';

type Notify = (variant: NotificationVariant, message: string, options?: NotificationOptions) => void;

/** The toast text of one gamification event. */
export function describeHabitEvent(event: HabitEvent): string {
  return event.kind === 'badge' ? `Badge unlocked: ${event.badge.label}. ${event.badge.description}` : `Level up! You reached level ${event.level}.`;
}

/** Raises one toast per badge unlock or level-up. */
export function announceHabitEvents(notify: Notify, events: readonly HabitEvent[]): void {
  for (const event of events) notify('success', describeHabitEvent(event));
}
