import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cleanRows, resampleToSegments } from '../../src/core/forecast/prepare';
import type { DropCounts } from '../../src/core/forecast/prepare';
import { CLEANING_RULES, RESAMPLE_OPTIONS } from '../../src/core/forecast/rules';
import { SLOT_MIN, FORECAST_VARIABLES } from '../../src/core/forecast/types';
import type { ForecastVariable, Segment } from '../../src/core/forecast/types';
import { SOURCE_FIELD } from '../../src/core/forecast/prepare';
import { MISSIONS, rawPath } from './fetch-osdr';

export const GRID_PATH = join('.cache', 'osdr', 'grid.json');

export interface MissionVariableProvenance {
  rawRows: number;
  cleanRows: number;
  dropped: DropCounts;
  gridSlots: number;
  gridDays: number;
  segments: number;
  firstDay: string | null;
  lastDay: string | null;
}

export interface GridFile {
  fetchedAt: string;
  preparedOn: string;
  slotMinutes: number;
  sourceFields: Record<ForecastVariable, string>;
  rules: Record<ForecastVariable, { description: string; min: number; max: number; placeholders: number[]; maxFlatMin: number | null }>;
  resample: { maxFillSlots: number; minSlots: number; method: string };
  /** Missions the API lists that have no usable data for a variable, with the reason. */
  provenance: Record<string, Partial<Record<ForecastVariable, MissionVariableProvenance>>>;
  /** variable -> mission -> segments */
  grid: Record<ForecastVariable, Record<string, Segment[]>>;
}

const dayOfSlot = (slot: number): string => {
  // Slot -> UTC calendar day without Date arithmetic in the core; scripts may use Date.
  return new Date(slot * SLOT_MIN * 60_000).toISOString().slice(0, 10);
};

export async function main(): Promise<void> {
  const grid: GridFile['grid'] = { co2: {}, cabinTemperature: {}, humidity: {} };
  const provenance: GridFile['provenance'] = {};
  let fetchedAt = '';
  for (const mission of MISSIONS) {
    let file: { fetchedAt: string; body: unknown };
    try {
      file = JSON.parse(await readFile(rawPath(mission), 'utf8')) as { fetchedAt: string; body: unknown };
    } catch {
      console.warn(`${mission}: no raw file, run the fetch script first`);
      continue;
    }
    if (file.fetchedAt > fetchedAt) fetchedAt = file.fetchedAt;
    const rows = Array.isArray(file.body) ? (file.body as Array<Record<string, unknown>>) : [];
    provenance[mission] = {};
    for (const variable of FORECAST_VARIABLES) {
      const field = SOURCE_FIELD[variable];
      const raw = rows.map((r) => ({ time: r.time, value: r[field] }));
      const cleaned = cleanRows(raw, CLEANING_RULES[variable]);
      const segments = resampleToSegments(cleaned.points, RESAMPLE_OPTIONS);
      const slots = segments.reduce((s, seg) => s + seg.values.length, 0);
      provenance[mission]![variable] = {
        rawRows: cleaned.rawRows,
        cleanRows: cleaned.points.length,
        dropped: cleaned.dropped,
        gridSlots: slots,
        gridDays: Math.round(((slots * SLOT_MIN) / 1440) * 100) / 100,
        segments: segments.length,
        firstDay: segments.length ? dayOfSlot(segments[0]!.startSlot) : null,
        lastDay: segments.length ? dayOfSlot(segments.at(-1)!.startSlot + segments.at(-1)!.values.length - 1) : null,
      };
      if (segments.length > 0) grid[variable][mission] = segments;
    }
  }
  const out: GridFile = {
    fetchedAt,
    preparedOn: new Date().toISOString().slice(0, 10),
    slotMinutes: SLOT_MIN,
    sourceFields: SOURCE_FIELD,
    rules: Object.fromEntries(
      FORECAST_VARIABLES.map((v) => {
        const r = CLEANING_RULES[v];
        return [v, { description: r.description, min: r.min, max: r.max, placeholders: r.placeholders, maxFlatMin: r.maxFlatMin }];
      }),
    ) as GridFile['rules'],
    resample: {
      ...RESAMPLE_OPTIONS,
      method:
        'Mean of the clean points inside each 15-minute slot (slot = floor(minutes since epoch / 15)). A gap of at most maxFillSlots empty slots is bridged by linear interpolation; a longer gap ends the segment. Segments shorter than minSlots are discarded.',
    },
    provenance,
    grid,
  };
  await mkdir(join('.cache', 'osdr'), { recursive: true });
  await writeFile(GRID_PATH, JSON.stringify(out));
  for (const v of FORECAST_VARIABLES) {
    const names = Object.keys(grid[v]);
    const slots = names.reduce((s, m) => s + grid[v][m]!.reduce((a, seg) => a + seg.values.length, 0), 0);
    console.log(`${v}: ${names.length} missions (${names.join(', ')}), ${((slots * SLOT_MIN) / 1440).toFixed(1)} days on the grid`);
  }
}
