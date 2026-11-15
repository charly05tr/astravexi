import { summarizeReference } from '../../core/environment/co2';
import type { Co2Reading, Co2Reference } from '../../core/environment/co2';
import type { CabinReferenceCache, CabinReferenceSource } from '../../core/ports';

/**
 * NASA OSDR Environmental Data Application (EDA) API. `GET {base}/missions/{mission}/co2/iss/` answers with
 * `[{ "time": ISO, "co2_iss": ppm | null }, ...]`, five minutes apart (one mission, historical, not live).
 * Docs: https://visualization.osdr.nasa.gov/eda/api_reference. The service sends no CORS headers, so a browser
 * cannot call it directly: the default base URL is a same-origin path that the Vite dev server proxies
 * (see vite.config.ts); a deployment needs an equivalent reverse proxy, or `VITE_NASA_OSDR_BASE_URL`.
 */
export const DEFAULT_OSDR_BASE_URL = '/nasa-osdr/eda/api';
/** The latest mission with ISS cabin CO2 samples in the EDA at the time of writing (Dec 2019 - Jan 2020). */
export const DEFAULT_OSDR_MISSION = 'RR-19';
export const OSDR_EDA_PUBLIC_URL = 'https://visualization.osdr.nasa.gov/eda/';

export interface OsdrOptions {
  baseUrl?: string;
  mission?: string;
  fetchFn?: typeof fetch;
  /** Gives up on NASA after this long, so a hung network never leaves the panel loading. */
  timeoutMs?: number;
}

export const DEFAULT_OSDR_TIMEOUT_MS = 15_000;

interface RawSample {
  time?: unknown;
  co2_iss?: unknown;
}

function parseSamples(body: unknown): Co2Reading[] {
  if (!Array.isArray(body)) throw new Error('NASA OSDR returned an unexpected response shape.');
  const readings: Co2Reading[] = [];
  for (const raw of body as RawSample[]) {
    if (typeof raw?.time === 'string' && typeof raw.co2_iss === 'number') readings.push({ t: raw.time, ppm: raw.co2_iss });
  }
  return readings;
}

/** Reads one mission's ISS cabin CO2 from NASA OSDR and summarises it. Never invents values. */
export function createNasaOsdrEnvironment(options: OsdrOptions = {}): CabinReferenceSource {
  const baseUrl = (options.baseUrl ?? DEFAULT_OSDR_BASE_URL).replace(/\/+$/, '');
  const mission = options.mission ?? DEFAULT_OSDR_MISSION;
  return {
    async fetchReference(): Promise<Co2Reference> {
      const fetchFn = options.fetchFn ?? fetch;
      const url = `${baseUrl}/missions/${encodeURIComponent(mission)}/co2/iss/`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_OSDR_TIMEOUT_MS);
      let body: unknown;
      try {
        let response: Response;
        try {
          response = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
        } catch {
          throw new Error(controller.signal.aborted ? 'NASA OSDR did not answer in time.' : 'NASA OSDR could not be reached.');
        }
        if (response.status === 404 && baseUrl.startsWith('/')) {
          // The dev server answers 404 for a JSON request it does not proxy: the /nasa-osdr rewrite is missing.
          throw new Error('the /nasa-osdr proxy is not active; restart the dev server or configure the rewrite');
        }
        if (!response.ok) throw new Error(`NASA OSDR answered with HTTP ${response.status}.`);
        try {
          body = await response.json();
        } catch {
          throw new Error(
            controller.signal.aborted ? 'NASA OSDR did not answer in time.' : 'NASA OSDR did not return JSON (is the /nasa-osdr proxy configured?).',
          );
        }
      } finally {
        clearTimeout(timer);
      }
      const reference = summarizeReference(mission, OSDR_EDA_PUBLIC_URL, parseSamples(body));
      if (!reference) throw new Error(`NASA OSDR has no usable ISS cabin CO2 samples for ${mission}.`);
      return reference;
    },
  };
}

/** The in-memory cache: also the fallback when IndexedDB is unavailable. */
export function createMemoryReferenceCache(): CabinReferenceCache {
  let saved: { reference: Co2Reference; fetchedAt: string } | null = null;
  return {
    async load() {
      return saved;
    },
    async save(reference, fetchedAt) {
      saved = { reference, fetchedAt };
    },
  };
}
