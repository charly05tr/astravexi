import { useEffect, useState } from 'react';
import { useAppContext, useAppState } from '../../app/app-context';
import { can } from '../../core/profiles/policy';
import type { CabinEnvironmentView } from '../../core/use-cases/environment';
import { CabinCo2Panel } from './CabinCo2Panel';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; view: CabinEnvironmentView };

/**
 * The cabin CO2 panel of the CMO dashboard. Renders nothing for any other role; the use-case refuses them again,
 * so this check only keeps the UI honest.
 */
export function CabinCo2Container() {
  const role = useAppState((s) => s.actor.role);
  return can(role, 'viewCabinEnvironment') ? <CabinCo2 /> : null;
}

function CabinCo2() {
  const { store } = useAppContext();
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const { loadCabinEnvironment } = store.getState();
    // Cache-first: show the saved NASA reference at once, then refresh it in the background only when stale.
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

  if (load.status === 'loading') {
    return (
      <p className="muted" role="status" aria-busy="true">
        Loading cabin CO2.
      </p>
    );
  }
  if (load.status === 'error') {
    return (
      <p className="banner" role="alert">
        The cabin CO2 could not be loaded.
      </p>
    );
  }
  return <CabinCo2Panel view={load.view} />;
}
