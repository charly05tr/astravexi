import { describe, expect, it } from 'vitest';
import { createMemoryReferenceCache, createNasaOsdrEnvironment } from './index';

/** Rows copied from the real `GET /eda/api/missions/RR-19/co2/iss/` answer, plus a null row as RR-18 returns. */
export const REAL_SAMPLE = [
  { time: '2019-12-03T10:24:00Z', co2_iss: 2511.0 },
  { time: '2019-12-03T10:29:00Z', co2_iss: 2511.0 },
  { time: '2020-01-07T19:55:00Z', co2_iss: 2793.0 },
  { time: '2020-01-07T20:00:00Z', co2_iss: 2825.0 },
  { time: '2020-01-07T20:05:00Z', co2_iss: 2825.0 },
  { time: '2020-01-07T20:10:00Z', co2_iss: 2665.0 },
  { time: '2021-12-20T00:01:00Z', co2_iss: null },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('NASA OSDR environment adapter', () => {
  it('requests the ISS CO2 series of the mission and summarises it', async () => {
    const urls: string[] = [];
    const source = createNasaOsdrEnvironment({
      baseUrl: '/nasa-osdr/eda/api/',
      mission: 'RR-19',
      fetchFn: async (url) => {
        urls.push(String(url));
        return json(REAL_SAMPLE);
      },
    });
    const ref = await source.fetchReference();
    expect(urls).toEqual(['/nasa-osdr/eda/api/missions/RR-19/co2/iss/']);
    expect(ref).toMatchObject({ mission: 'RR-19', count: 6, maxPpm: 2825, from: '2019-12-03T10:24:00Z', to: '2020-01-07T20:10:00Z' });
    expect(ref.sourceUrl).toBe('https://visualization.osdr.nasa.gov/eda/');
  });

  it('rejects on a network failure, an HTTP error, a non-JSON body, a wrong shape and an empty series', async () => {
    const make = (fetchFn: typeof fetch) => createNasaOsdrEnvironment({ fetchFn }).fetchReference();
    await expect(make(async () => Promise.reject(new TypeError('Failed to fetch')))).rejects.toThrow(/could not be reached/);
    await expect(make(async () => json({}, 503))).rejects.toThrow(/HTTP 503/);
    await expect(make(async () => new Response('<html>', { status: 200 }))).rejects.toThrow(/did not return JSON/);
    await expect(make(async () => json({ detail: 'nope' }))).rejects.toThrow(/unexpected response shape/);
    await expect(make(async () => json([{ time: '2021-12-20T00:01:00Z', co2_iss: null }]))).rejects.toThrow(/no usable/);
  });

  it('keeps the last saved reference in the cache', async () => {
    const cache = createMemoryReferenceCache();
    expect(await cache.load()).toBeNull();
    const ref = await createNasaOsdrEnvironment({ fetchFn: async () => json(REAL_SAMPLE) }).fetchReference();
    await cache.save(ref, '2026-06-15T09:00:00.000Z');
    expect(await cache.load()).toEqual({ reference: ref, fetchedAt: '2026-06-15T09:00:00.000Z' });
  });

  it('gives up after the timeout instead of loading forever', async () => {
    const source = createNasaOsdrEnvironment({
      timeoutMs: 10,
      fetchFn: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    });
    await expect(source.fetchReference()).rejects.toThrow('NASA OSDR did not answer in time.');
  });
});
