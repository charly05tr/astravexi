/** The cabin variables the forecast and the calibration cover. Radiation is excluded: its unit is not documented. */
export type ForecastVariable = 'co2' | 'cabinTemperature' | 'humidity';
export const FORECAST_VARIABLES: readonly ForecastVariable[] = ['co2', 'cabinTemperature', 'humidity'];

/** Forecast horizons in hours. */
export const HORIZONS_H = [1, 3, 6] as const;
export type HorizonH = (typeof HORIZONS_H)[number];

/** The fixed grid every series is resampled to, in minutes. */
export const SLOT_MIN = 15;
export const SLOTS_PER_HOUR = 60 / SLOT_MIN;
export const SLOTS_PER_DAY = 96;

/** A contiguous run of grid values (no gap longer than the fill limit) starting at an absolute slot index. */
export interface Segment {
  /** Slot index = floor(minutes since the epoch / 15). Slot 0 of the day is midnight UTC. */
  startSlot: number;
  values: number[];
}
