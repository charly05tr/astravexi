import type { AiSettings, AiSettingsStore } from '../../core/ports';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, MODEL_PRESETS, RETIRED_PRESETS } from './config';

const KEY = 'astravexi.ai-assistant';

const DEFAULTS: AiSettings = { apiKey: '', model: DEFAULT_MODEL, baseUrl: DEFAULT_BASE_URL, remember: false };

/** A storage that may be missing or throw (private windows, blocked site data). */
function pick(name: 'sessionStorage' | 'localStorage'): Storage | null {
  try {
    return globalThis[name] ?? null;
  } catch {
    return null;
  }
}

function read(storage: Storage | null): Partial<AiSettings> | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const v = value as Record<string, unknown>;
    return {
      ...(typeof v.apiKey === 'string' ? { apiKey: v.apiKey } : {}),
      ...(typeof v.model === 'string' ? { model: v.model } : {}),
      ...(typeof v.baseUrl === 'string' ? { baseUrl: v.baseUrl } : {}),
    };
  } catch {
    return null;
  }
}

function write(storage: Storage | null, settings: AiSettings): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ apiKey: settings.apiKey, model: settings.model, baseUrl: settings.baseUrl }));
  } catch {
    // Storage is optional: the in-memory copy still works for this page.
  }
}

function remove(storage: Storage | null): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Nothing to do: there is nothing readable to forget.
  }
}

export interface AiSettingsStoreOptions {
  /** Defaults to window.sessionStorage. Pass null to disable. */
  session?: Storage | null;
  /** Defaults to window.localStorage. Only written when the user ticks "Remember on this device". */
  local?: Storage | null;
}

/**
 * Keeps the user's key in memory and in sessionStorage (gone when the tab closes). localStorage is used only
 * when `remember` is true. The key is never logged and never read from build-time environment variables.
 */
export function createAiSettingsStore(options: AiSettingsStoreOptions = {}): AiSettingsStore {
  const session = options.session === undefined ? pick('sessionStorage') : options.session;
  const local = options.local === undefined ? pick('localStorage') : options.local;
  const listeners = new Set<() => void>();

  const saved = read(local);
  let current: AiSettings = saved
    ? { ...DEFAULTS, ...saved, remember: true }
    : { ...DEFAULTS, ...read(session), remember: false };

  // A saved model that was one of the old presets is not the user's deliberate choice: use the new default.
  if (RETIRED_PRESETS.includes(current.model)) current = { ...current, model: DEFAULT_MODEL };

  const emit = () => listeners.forEach((l) => l());

  return {
    presets: { models: MODEL_PRESETS, defaultBaseUrl: DEFAULT_BASE_URL },
    get: () => current,
    set(next) {
      current = { ...next };
      if (next.remember) {
        write(local, current);
        remove(session);
      } else {
        write(session, current);
        remove(local);
      }
      emit();
    },
    clear() {
      current = { ...DEFAULTS };
      remove(session);
      remove(local);
      emit();
    },
    isConfigured: () => current.apiKey.trim() !== '' && current.model.trim() !== '',
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
