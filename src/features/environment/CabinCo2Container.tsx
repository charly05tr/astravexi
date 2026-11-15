import { useEffect, useState } from 'react';
import { useAppContext } from '../../app/app-context';
import type { CabinEnvironmentView } from '../../core/use-cases/environment';

export type ReferenceLoad = { status: 'loading' } | { status: 'error' } | { status: 'ready'; view: CabinEnvironmentView };

/**
 * Loads the NASA ISS CO2 reference for the cabin page. Cache-first: the saved copy is shown at once and refreshed in
 * the background only when stale. Only the page of a role that may view the cabin mounts this; the use-case refuses
 * everyone else again. The presentation lives in the "Cabin air" row and in "Data & method".
 */
export function useCabinReference(): ReferenceLoad {
  const { store } = useAppContext();
  const [load, setLoad] = useState<ReferenceLoad>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const { loadCabinEnvironment } = store.getState();
    loadCabinEnvironment({ cacheFirst: true })
      .then((view) => {
        if (cancelled) return;
        setLoad({ status: 'ready', view });
        if (view.reference.status === 'saved' && view.reference.stale) {
          loadCabinEnvironment()
            .then((fresh) => {
              if (!cancelled) setLoad({ status: 'ready', view: fresh });
            })
            .catch(() => undefined); // keep the saved copy on screen
        }
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  return load;
}
