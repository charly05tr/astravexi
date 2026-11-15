import { ChevronDown, ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';
import { CO2_OPS_LIMITS } from '../../core/environment/co2';
import type { CabinAnalysisView } from '../../core/use-cases/cabin-analysis';
import { formatValue } from './analysis-model';
import { collectSources } from './cabin-board-model';
import type { ReferenceLoad } from './CabinCo2Container';
import { ForecastModelCard } from './ForecastPanels';

const ppm = (n: number) => `${Math.round(n).toLocaleString('en-US')} ppm`;
const mmHg = (n: number) => `${n.toFixed(2)} mmHg`;
const day = (iso: string) => iso.slice(0, 10);
const stamp = (iso: string) => iso.slice(0, 16).replace('T', ' ');

/** The real ISS CO2 telemetry reference: what it is, where it came from and how fresh the copy on screen is. */
function IssReference({ load }: { load: ReferenceLoad }) {
  const state = load.status === 'ready' ? load.view.reference : null;
  const ref = state && state.status !== 'unavailable' ? state : null;
  return (
    <div className="method__block" role="group" aria-label="ISS CO2 reference">
      <h4 className="method__title">ISS CO2 reference</h4>
      {load.status === 'loading' ? (
        <p className="muted small" role="status" aria-busy="true">
          Loading the NASA ISS reference.
        </p>
      ) : load.status === 'error' ? (
        <p className="banner" role="alert">
          The cabin CO2 reference could not be loaded.
        </p>
      ) : ref ? (
        <>
          <p className="small">
            Typical level <strong>{ppm(ref.reference.thresholdPpm)}</strong> (95th percentile) of ISS cabin CO2 during mission {ref.reference.mission} (
            {day(ref.reference.from)} to {day(ref.reference.to)}, {ref.reference.count.toLocaleString('en-US')} samples). It is shown on the CO2 row for
            comparison; the NASA limit stays the decision threshold.
          </p>
          <p className="muted small">
            Median {ppm(ref.reference.medianPpm)}, mean {ppm(ref.reference.meanPpm)}, maximum {ppm(ref.reference.maxPpm)}. Ops limits for reference:
            attention {mmHg(CO2_OPS_LIMITS.attention.mmHg)} ({ppm(CO2_OPS_LIMITS.attention.ppm)}), high {mmHg(CO2_OPS_LIMITS.high.mmHg)} (
            {ppm(CO2_OPS_LIMITS.high.ppm)}).
          </p>
          <p className="muted small" role="status">
            {ref.status === 'cached'
              ? `Offline: showing the copy saved on ${stamp(ref.fetchedAt)} UTC.`
              : ref.status === 'saved'
                ? `Saved on ${stamp(ref.fetchedAt)} UTC${ref.stale ? '; refreshing from NASA.' : '.'}`
                : `Updated ${stamp(ref.fetchedAt)} UTC.`}
          </p>
        </>
      ) : (
        <p className="banner" role="alert">
          The NASA ISS reference is unavailable ({state?.status === 'unavailable' ? state.message : ''}) and nothing is saved on this device yet. No
          comparison is shown.
        </p>
      )}
      <p className="muted small">
        These are historical ISS mission values, not live: the station does not publish real-time cabin CO2. Source:{' '}
        <a href="https://visualization.osdr.nasa.gov/eda/" target="_blank" rel="noreferrer">
          NASA OSDR Environmental Data Application
        </a>
        .
      </p>
    </div>
  );
}

function Sources({ view }: { view: CabinAnalysisView }) {
  const sources = collectSources(view);
  return (
    <div className="method__block" role="group" aria-label="Sources">
      <h4 className="method__title">Sources</h4>
      <ul className="method__sources">
        {sources.map((s) => (
          <li key={s.source.url}>
            <a href={s.source.url} target="_blank" rel="noreferrer">
              {s.source.label}
            </a>
            {s.needsVerification ? <span className="muted small"> (needs verification by flight surgeons)</span> : null}
            <span className="muted small"> Used for: {s.usedFor.join('; ')}.</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The collapsed "Data & method" section: model card, ISS reference, radiation note and every citation, once. */
export function DataAndMethod({ view, reference }: { view: CabinAnalysisView; reference: ReferenceLoad }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const radiation = view.variables.find((v) => v.def.cumulativeLimit !== undefined);
  return (
    <section className="board__section" aria-labelledby="data-method-title">
      <h3 id="data-method-title" className="board__title">
        <button type="button" className="disclosure" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
          Data &amp; method
        </button>
      </h3>
      <div id={bodyId} hidden={!open}>
        {open ? (
          <div className="method">
            <ForecastModelCard card={view.modelCard} />
            <IssReference load={reference} />
            {radiation ? (
              <div className="method__block" role="group" aria-label="Radiation note">
                <h4 className="method__title">Radiation</h4>
                <p className="small">
                  {radiation.def.note} Career limit {formatValue(radiation.def.cumulativeLimit!, radiation.def.unit)}.
                </p>
              </div>
            ) : null}
            <Sources view={view} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
