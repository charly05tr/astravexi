import { useEffect, useRef, useState } from 'react';
import { useAppContext, useAppState } from '../../app/app-context';
import type { Verdict } from '../../core/attribution/model';
import { can } from '../../core/profiles/policy';
import type { CabinAnalysisView } from '../../core/use-cases/cabin-analysis';
import { SourceBadge } from '../../ui/Badge';
import { useCoalescedLoad } from '../shared/use-coalesced-load';
import { cabinAnnouncement } from './playback-announcements';
import { CabinAir } from './CabinAir';
import { useCabinReference } from './CabinCo2Container';
import { CabinKpiRow } from './CabinKpiRow';
import { DataAndMethod } from './DataAndMethod';
import { NeedsAttention } from './NeedsAttention';

/** The "Cabin & crew analysis" page. CMO only: any other role sees nothing here. */
export function CabinAnalysisContainer() {
  const role = useAppState((s) => s.actor.role);
  return can(role, 'viewCabinEnvironment') ? <CabinAnalysisPage /> : null;
}

function CabinAnalysisPage() {
  const { store } = useAppContext();
  // A new session (sync pull, day rollover, check-in) means the crew's readings may have changed.
  const session = useAppState((s) => s.session);
  // Keeps the previous analysis on screen while the next one is computed (mission playback changes the session often).
  const [loaded] = useCoalescedLoad(() => store.getState().loadCabinAnalysis(), session);
  const load: { status: 'loading' } | { status: 'error' } | { status: 'ready'; view: CabinAnalysisView } =
    loaded.status === 'ready' ? { status: 'ready', view: loaded.value } : loaded;
  const [cause, setCause] = useState<Verdict | null>(null);
  const reference = useCabinReference();
  const scenario = useAppState((s) => s.scenario);
  const playback = useAppState((s) => s.playback);
  // Tell the live region (playback only) when the cabin changes tier or new items need attention.
  const previous = useRef<CabinAnalysisView | null>(null);
  const view = load.status === 'ready' ? load.view : null;
  useEffect(() => {
    if (!view) return;
    if (playback) {
      const text = cabinAnnouncement(previous.current, view);
      if (text) playback.announce(text);
    }
    previous.current = view;
  }, [view, playback]);

  const issP95 = reference.status === 'ready' && reference.view.reference.status !== 'unavailable' ? reference.view.reference.reference.thresholdPpm : null;

  return (
    <section className="crew cabin-analysis" aria-labelledby="cabin-analysis-title">
      <header className="crew__head">
        <h2 id="cabin-analysis-title" className="crew__title">
          Cabin &amp; crew analysis
        </h2>
        <p className="panel__hint">Is the cabin air within NASA limits, and which crew readings are atypical because of it?</p>
        {scenario ? (
          <p className="notice" role="status">
            Scenario: {scenario.name}. {scenario.description} Evaluation seed {scenario.seed}; the demo clock starts once the injected
            readings are in (inside the cabin excursion when there is one).
          </p>
        ) : null}
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
