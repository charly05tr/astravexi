import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Downloads the NASA OSDR EDA telemetry of every listed mission into the gitignored raw cache.
 * Node can call the API directly (the browser needs the Vite proxy because the API sends no CORS headers).
 * Docs: https://visualization.osdr.nasa.gov/eda/api_reference
 */
export const OSDR_BASE = 'https://visualization.osdr.nasa.gov/eda/api';
export const RAW_DIR = join('.cache', 'osdr', 'raw');
export const MISSIONS = [
  'RR-1', 'RR-3', 'RR-4', 'RR-5', 'RR-6', 'RR-7', 'RR-8', 'RR-9', 'RR-12', 'RR-17', 'RR-18', 'RR-19', 'RR-23',
  'APEX-03-1', 'APEX-03-2', 'APEX-04', 'VEG-01A', 'VEG-01B', 'VEG-01C',
] as const;

export const rawPath = (mission: string) => join(RAW_DIR, `${mission}.telemetry.json`);

async function getJson(url: string, attempts = 4): Promise<unknown> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      last = error;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw new Error(`${url}: ${String(last)}`);
}

export async function main(args: string[]): Promise<void> {
  const force = args.includes('--force');
  await mkdir(RAW_DIR, { recursive: true });
  for (const mission of MISSIONS) {
    const file = rawPath(mission);
    if (!force) {
      try {
        await readFile(file);
        console.log(`${mission}: cached`);
        continue;
      } catch {
        /* not cached yet */
      }
    }
    const body = await getJson(`${OSDR_BASE}/missions/${mission}/telemetry_data/`);
    const rows = Array.isArray(body) ? body.length : -1;
    await writeFile(file, JSON.stringify({ mission, fetchedAt: new Date().toISOString(), body }));
    console.log(`${mission}: ${rows} rows`);
  }
}
