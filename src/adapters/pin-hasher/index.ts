import type { PinHasher } from '../../core/ports';
import type { PinRecord } from '../../core/profiles/model';

/** OWASP's 2023 floor for PBKDF2-HMAC-SHA256 is 600k; tests pass a small number to stay fast. */
export const DEFAULT_PIN_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};
const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, HASH_BITS);
  return new Uint8Array(bits);
}

/** Compares without bailing out at the first differing byte. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * PIN hashing with WebCrypto PBKDF2-SHA256 and a random salt per PIN. This keeps profiles apart on a shared
 * device; the data itself stays unencrypted in IndexedDB, so it is NOT a security boundary.
 */
export function createPinHasher(iterations: number = DEFAULT_PIN_ITERATIONS): PinHasher {
  return {
    async hash(pin): Promise<PinRecord> {
      const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
      return { hash: toBase64(await derive(pin, salt, iterations)), salt: toBase64(salt), iterations };
    },
    async verify(pin, record) {
      const actual = await derive(pin, fromBase64(record.salt), record.iterations);
      return equalBytes(actual, fromBase64(record.hash));
    },
  };
}
