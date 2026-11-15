import { useEffect, useState } from 'react';
import { useAppContext, useAppState } from '../../app/app-context';
import { can } from '../../core/profiles/policy';
import type { CabinAnalysisView } from '../../core/use-cases/cabin-analysis';
import { CabinCo2Container } from './CabinCo2Container';
import { AtypicalReadingsPanel, CabinVariablesPanel } from './CabinAnalysisPanels';

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

  return (
    <section className="crew cabin-analysis" aria-labelledby="cabin-analysis-title">
      <header className="crew__head">
        <h2 id="cabin-analysis-title" className="crew__title">
          Cabin &amp; crew analysis
        </h2>
        <p className="panel__hint">
          For each atypical reading: is the likely cause the cabin (external) or the person (internal)? Three signals are crossed: the
          person&apos;s own history, the rest of the crew, and a cabin variable outside its NASA limit with a documented link.
        </p>
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
          <AtypicalReadingsPanel view={load.view} />
          <CabinVariablesPanel view={load.view} />
        </>
      )}
      <CabinCo2Container />
    </section>
  );
}
