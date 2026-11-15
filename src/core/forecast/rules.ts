import type { CleaningRule, ResampleOptions } from './prepare';
import type { ForecastVariable } from './types';

/**
 * Cleaning rules per ISS variable, applied by scripts/cabin-data/prepare-grid.ts. Units: the EDA reference page does
 * not state them; ppm for CO2 is documented by NASA OSDR, degrees Celsius for temperature and percent for humidity are
 * inferred from the magnitudes (cabin medians of 21-23 and 38-49).
 */
export const CLEANING_RULES: Record<ForecastVariable, CleaningRule> = {
  co2: {
    min: 350,
    max: 10000,
    placeholders: [2000, 3000, 250, 500, 128],
    maxFlatMin: 180,
    description:
      'Null dropped. Fill values 2000, 3000, 250, 500 and 128 ppm dropped. Values outside 350-10000 ppm dropped (sensor offline or impossible for a ventilated cabin). Runs of one identical value spanning 3 hours or more dropped: a ppm sensor held at one reading is stuck, not measuring.',
  },
  cabinTemperature: {
    min: 15,
    max: 32,
    placeholders: [],
    maxFlatMin: null,
    description:
      'Null dropped. Values outside 15-32 C dropped as sensor errors (the NASA crew-health range is 18-27 C). Flat runs are kept: the readings are quantised to 0.1-1 C.',
  },
  humidity: {
    min: 5,
    max: 100,
    placeholders: [],
    maxFlatMin: null,
    description:
      'Null dropped. Values outside 5-100 % dropped: relative humidity above 100 % is physically impossible (RR-18 reaches 125.8) and below 5 % is a sensor error. Flat runs are kept: the readings are quantised to 1 %.',
  },
};

/** A gap of at most 30 minutes (two empty slots) is bridged by linear interpolation; a longer one splits the series. */
export const RESAMPLE_OPTIONS: ResampleOptions = { maxFillSlots: 2, minSlots: 48 };
