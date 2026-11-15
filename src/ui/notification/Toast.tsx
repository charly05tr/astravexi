import { CircleCheck, CircleX, Info, X } from 'lucide-react';
import type { NotificationItem } from './types';

const ICON_BY_VARIANT = { success: CircleCheck, error: CircleX, info: Info };

export function Toast({ notification, onDismiss }: { notification: NotificationItem; onDismiss(id: number): void }) {
  const Icon = ICON_BY_VARIANT[notification.variant];
  const { action } = notification;
  return (
    <div className={`toast toast--${notification.variant}`}>
      <Icon size={20} className="toast__icon" aria-hidden="true" />
      <div className="toast__body">
        <p className="toast__message">{notification.message}</p>
        {action ? (
          <button
            type="button"
            className="link-button toast__action"
            onClick={() => {
              action.onClick();
              onDismiss(notification.id);
            }}
          >
            {action.label}
          </button>
        ) : null}
      </div>
      <button type="button" className="icon-button toast__close" aria-label="Close notification" onClick={() => onDismiss(notification.id)}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
