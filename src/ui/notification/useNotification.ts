import { useContext } from 'react';
import { NotificationContext } from './notificationContext';

/** Returns `notify(variant, message, options?)`. Needs a NotificationProvider above it. */
export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification needs a NotificationProvider.');
  return context.notify;
};
