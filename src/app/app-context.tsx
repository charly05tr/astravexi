import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useStore } from 'zustand';
import type { Knowledge } from '../core/health/model';
import type { Content } from '../knowledge';
import type { AppState, AppStore } from './store/app-store';

export interface AppContextValue {
  store: AppStore;
  knowledge: Knowledge;
  content: Content;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Gives features the store, the loaded knowledge and the explanation content without prop drilling. */
export function AppProvider({ value, children }: { value: AppContextValue; children: ReactNode }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useAppContext needs an AppProvider.');
  return value;
}

/** Select a slice of the store. Selectors must return primitives or stable references. */
export function useAppState<T>(selector: (state: AppState) => T): T {
  return useStore(useAppContext().store, selector);
}

/** Store actions are stable functions, so reading them once is safe. */
export function useAppActions(): AppState {
  return useAppContext().store.getState();
}
