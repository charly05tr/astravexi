import { composeAdapters, createBrowserModePreference } from './composition-root';
import { resolveMode } from './mode';
import type { AppMode } from './mode';
import { createAppStore } from './store/app-store';
import type { AppStore } from './store/app-store';

export type BootResult =
  | { kind: 'choose'; choose(mode: AppMode): void }
  | { kind: 'ready'; store: AppStore };

/**
 * Resolve the mode (URL override > persisted choice > ask), then build that mode's adapters and store.
 * A `?mode=` override is used for this load only; it never overwrites the persisted choice.
 */
export async function boot(search: string): Promise<BootResult> {
  const preference = createBrowserModePreference();
  const { mode } = resolveMode(search, preference);
  if (mode === null) {
    return {
      kind: 'choose',
      choose(chosen) {
        preference.set(chosen); // the explicit choice is the only thing that persists
        window.location.reload();
      },
    };
  }
  const adapters = await composeAdapters(mode);
  return { kind: 'ready', store: createAppStore(adapters) };
}
