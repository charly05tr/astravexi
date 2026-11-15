import type { ActiveProfile } from '../../core/ports';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Active-profile preference backed by localStorage; falls back to memory when storage throws or is missing. */
export function createActiveProfile(storage: KeyValueStorage | undefined, key: string): ActiveProfile {
  let memory: string | null = null;
  return {
    get() {
      try {
        const raw = storage?.getItem(key);
        if (typeof raw === 'string' && raw !== '') return raw;
      } catch {
        // storage blocked: fall through to memory
      }
      return memory;
    },
    set(profileId) {
      memory = profileId;
      try {
        storage?.setItem(key, profileId);
      } catch {
        // storage blocked: the memory copy still serves this session
      }
    },
    clear() {
      memory = null;
      try {
        storage?.removeItem(key);
      } catch {
        // nothing to clean up
      }
    },
  };
}
