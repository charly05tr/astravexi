import { useSyncExternalStore } from 'react';

/** Per browser: whether the player bar is hidden. Default shown. Storage can be blocked, so every access is guarded. */
export const PLAYER_HIDDEN_KEY = 'astravexi.playback.hidden';

let memory = false; // used when storage is unavailable
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    const v = localStorage.getItem(PLAYER_HIDDEN_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
    return v === null ? memory : false;
  } catch {
    return memory;
  }
}

export function setPlayerHidden(hidden: boolean): void {
  memory = hidden;
  try {
    localStorage.setItem(PLAYER_HIDDEN_KEY, hidden ? '1' : '0');
  } catch {
    // The choice then lasts for this page only.
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePlayerHidden(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
