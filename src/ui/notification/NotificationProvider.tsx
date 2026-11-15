import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NotificationContext } from './notificationContext';
import { Toast } from './Toast';
import type { NotificationItem, NotificationOptions, NotificationVariant } from './types';

const DEFAULT_MS = 5000;
const ACTION_MS = 10000;

/**
 * App-level toasts: stacked bottom-right, auto-dismissed, announced to screen readers (`role="status"`;
 * errors are `role="alert"`). A group is rendered only while it has toasts, so an empty region never shows up. Toasts render in a portal so dialogs never cover them.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (variant: NotificationVariant, message: string, options: NotificationOptions = {}) => {
      const id = nextId.current++;
      setItems((current) => [...current, { id, variant, message, ...(options.action ? { action: options.action } : {}) }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), options.durationMs ?? (options.action ? ACTION_MS : DEFAULT_MS)),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const live = timers.current;
    return () => live.forEach((t) => clearTimeout(t));
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);
  const errors = items.filter((i) => i.variant === 'error');
  const others = items.filter((i) => i.variant !== 'error');

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-stack">
          {others.length > 0 ? (
            <div role="status" className="toast-stack__group">
              {others.map((item) => (
                <Toast key={item.id} notification={item} onDismiss={dismiss} />
              ))}
            </div>
          ) : null}
          {errors.length > 0 ? (
            <div role="alert" className="toast-stack__group">
              {errors.map((item) => (
                <Toast key={item.id} notification={item} onDismiss={dismiss} />
              ))}
            </div>
          ) : null}
        </div>,
        document.body,
      )}
    </NotificationContext.Provider>
  );
}
