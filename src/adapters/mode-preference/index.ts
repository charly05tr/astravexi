import type { ModePreference } from '../../core/ports';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Mode preference backed by localStorage; falls back to memory when storage throws or is missing. */
export function createModePreference<M extends string>(
  storage: KeyValueStorage | undefined,
  key: string,
  isValid: (value: unknown) => value is M,
): ModePreference<M> {
  let memory: M | null = null;
  return {
    get() {
      try {
        const raw = storage?.getItem(key);
        if (isValid(raw)) return raw;
      } catch {
        // storage blocked: fall through to memory
      }
      return memory;
    },
    set(mode) {
      memory = mode;
      try {
        storage?.setItem(key, mode);
      } catch {
        // storage blocked: the memory copy still serves this session
      }
    },
  };
}
