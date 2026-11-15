import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export type LoadState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; value: T };

/**
 * Runs `load` when `trigger` changes and keeps the PREVIOUS result on screen while the next one is computed (no loading
 * state after the first load). Loads never pile up: while one is running, any number of triggers collapse into one more run
 * afterwards, so a fast-changing trigger (mission playback) costs at most one load at a time.
 */
export function useCoalescedLoad<T>(load: () => Promise<T>, trigger: unknown): [LoadState<T>, Dispatch<SetStateAction<LoadState<T>>>] {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const flight = useRef({ busy: false, dirty: false, alive: true, load });

  useEffect(() => {
    flight.current.load = load;
  });

  useEffect(() => {
    const f = flight.current;
    f.alive = true;
    const start = () => {
      if (f.busy) {
        f.dirty = true;
        return;
      }
      f.busy = true;
      f.load()
        .then(
          (value) => {
            if (f.alive) setState({ status: 'ready', value });
          },
          () => {
            if (f.alive) setState({ status: 'error' });
          },
        )
        .finally(() => {
          f.busy = false;
          if (f.dirty && f.alive) {
            f.dirty = false;
            start();
          }
        });
    };
    start();
    return () => {
      f.alive = false;
    };
  }, [trigger]);

  return [state, setState];
}
