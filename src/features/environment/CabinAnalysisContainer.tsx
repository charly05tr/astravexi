import { useEffect, useState } from 'react';
import { useAppContext, useAppState } from '../../app/app-context';
import type { Verdict } from '../../core/attribution/model';
import { can } from '../../core/profiles/policy';
import type { CabinAnalysisView } from '../../core/use-cases/cabin-analysis';
import { SourceBadge } from '../../ui/Badge';
import { CabinAir } from './CabinAir';
import { useCabinReference } from './CabinCo2Container';
import { CabinKpiRow } from './CabinKpiRow';
import { DataAndMethod } from './DataAndMethod';
import { NeedsAttention } from './NeedsAttention';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; view: CabinAnalysisView };

/** The "Cabin & crew analysis" page. CMO only: any other role sees nothing here. */
export function CabinAnalysisContainer() {
  const role = useAppState((s) => s.actor.role);
  return can(role, 'viewCabinEnvironment') ? <CabinAnalysisPage /> : null;
}

function CabinAnalysisPage() {
  const { store } = useAppContext();
  // A new session (sync pull, day rollover, check-in) means the crew's readings may have changed.
  const session = useAppState((s) => s.session);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [cause, setCause] = useState<Verdict | null>(null);
  const reference = useCabinReference();

  useEffect(() => {
    let cancelled = false;
    store
      .getState()
      .loadCabinAnalysis()
      .then((view) => {
        if (!cancelled) setLoad({ status: 'ready', view });
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [store, session]);

  const issP95 = reference.status === 'ready' && reference.view.reference.status !== 'unavailable' ? reference.view.reference.reference.thresholdPpm : null;

  return (
    <section className="crew cabin-analysis" aria-labelledby="cabin-analysis-title">
      <header className="crew__head">
        <h2 id="cabin-analysis-title" className="crew__title">
          Cabin &amp; crew analysis
        </h2>
        <p className="panel__hint">Is the cabin air within NASA limits, and which crew readings are atypical because of it?</p>
        {load.status === 'ready' ? (
          load.view.simulated ? (
            <p className="notice">
              <SourceBadge source="SYNTHETIC" /> Simulated data: the cabin values and crew readings on this page are generated for the demo.
            </p>
          ) : (
            <p className="banner">There are no simulated cabin values in LIVE mode, so nothing is shown here until a real source exists.</p>
          )
        ) : null}
      </header>
      {load.status === 'loading' ? (
        <p className="muted" role="status" aria-busy="true">
          Loading cabin and crew analysis.
        </p>
      ) : load.status === 'error' ? (
        <p className="banner" role="alert">
          The cabin and crew analysis could not be loaded.
        </p>
      ) : (
        <>
          <CabinKpiRow view={load.view} cause={cause} onCause={setCause} />
          <NeedsAttention view={load.view} cause={cause} onCause={setCause} />
          <CabinAir view={load.view} issP95={issP95} />
          <DataAndMethod view={load.view} reference={reference} />
        </>
      )}
    </section>
  );
}
