import { useEffect, useState } from 'react';

/** The current time, refreshed every `intervalMs`, so "5 min ago" labels stay honest without a render per second. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
