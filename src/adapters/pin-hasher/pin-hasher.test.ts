import { describe, expect, it } from 'vitest';
import { createPinHasher } from './index';

const hasher = createPinHasher(1000);

describe('pin hasher (PBKDF2-SHA256)', () => {
  it('verifies the right PIN and rejects a wrong one', async () => {
    const record = await hasher.hash('2468');
    expect(await hasher.verify('2468', record)).toBe(true);
    expect(await hasher.verify('2469', record)).toBe(false);
    expect(await hasher.verify('', record)).toBe(false);
  });

  it('uses a random salt: the same PIN hashes differently each time', async () => {
    const a = await hasher.hash('2468');
    const b = await hasher.hash('2468');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(await hasher.verify('2468', b)).toBe(true);
  });

  it('records the iteration count and never stores the PIN', async () => {
    const record = await hasher.hash('13572468');
    expect(record.iterations).toBe(1000);
    expect(JSON.stringify(record)).not.toContain('13572468');
  });

  it('verifies against the iteration count stored in the record, not the hasher default', async () => {
    const record = await createPinHasher(2000).hash('1111');
    expect(await hasher.verify('1111', record)).toBe(true);
  });
});
