const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})$/;

/** Days since 1970-01-01 of a proleptic Gregorian date (Howard Hinnant's algorithm). Pure: the core has no Date. */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * Epoch milliseconds of an ISO-8601 timestamp with a timezone (`Z` or an offset), or null when it is not one.
 * Fractions beyond milliseconds are dropped: the server writes microseconds, the device writes milliseconds.
 */
export function parseIso(iso: string | undefined | null): number | null {
  if (typeof iso !== 'string') return null;
  const m = ISO.exec(iso);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60) return null;
  const millis = m[7] ? Number(m[7].slice(0, 3).padEnd(3, '0')) : 0;
  let offsetMin = 0;
  if (m[8] !== 'Z') {
    const digits = m[8]!.replace(':', '');
    offsetMin = (digits[0] === '-' ? -1 : 1) * (Number(digits.slice(1, 3)) * 60 + Number(digits.slice(3, 5)));
  }
  const seconds = daysFromCivil(year, month, day) * 86400 + hour * 3600 + minute * 60 + second - offsetMin * 60;
  return seconds * 1000 + millis;
}

/** Milliseconds of an ISO-8601 timestamp; an unparsable value counts as the epoch so it never wins a comparison. */
export function tsMs(iso: string | undefined | null): number {
  return parseIso(iso) ?? 0;
}

/** True when `a` is strictly later than `b`. Compares instants, not strings: the server emits microseconds. */
export function isNewer(a: string | undefined | null, b: string | undefined | null): boolean {
  return tsMs(a) > tsMs(b);
}

/** The later of two timestamps (the first one wins a tie, and a null is ignored). */
export function laterOf(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return isNewer(b, a) ? b : a;
}
