export type NotificationVariant = 'success' | 'error' | 'info';

export interface NotificationAction {
  label: string;
  onClick(): void;
}

export interface NotificationOptions {
  action?: NotificationAction;
  /** How long the toast stays. Default 5 s, or 10 s when it carries an action. */
  durationMs?: number;
}

export interface NotificationItem {
  id: number;
  variant: NotificationVariant;
  message: string;
  action?: NotificationAction;
}
