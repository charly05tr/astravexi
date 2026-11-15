import { createContext } from 'react';
import type { NotificationOptions, NotificationVariant } from './types';

export interface NotificationContextValue {
  notify: (variant: NotificationVariant, message: string, options?: NotificationOptions) => void;
}

export const NotificationContext = createContext<NotificationContextValue | null>(null);
