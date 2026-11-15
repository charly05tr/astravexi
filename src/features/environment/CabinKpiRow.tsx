import { CircleCheck, CircleHelp, Home, Orbit, Thermometer } from 'lucide-react';
import type { ReactNode } from 'react';
import { useId } from 'react';
import type { Verdict } from '../../core/attribution/model';
import type { CabinAnalysisView } from '../../core/use-cases/cabin-analysis';
import { TierChip, tierStyle } from '../../ui/TierChip';
import { countByVerdict, formatValue } from './analysis-model';
import { CAUSES, breachText, countItemsByVerdict, percentText, shortLabel, summarizeCabinNow, summarizeOutlook, summarizeRadiation } from './cabin-board-model';

export const VERDICT_ICON: Record<Verdict, ReactNode> = {
  'likely-external': <Orbit size={14} aria-hidden="true" />,
  'possibly-external': <Thermometer size={14} aria-hidden="true" />,
  'likely-internal': <Home size={14} aria-hidden="true" />,
  'insufficient-data': <CircleHelp size={14} aria-hidden="true" />,
};

function Tile({ label, question, children }: { label: string; question: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="kpi" role="group" aria-labelledby={id}>
      <p className="kpi__label">
        <span id={id}>{label}</span> <span className="kpi__question">{question}</span>
      </p>
      {children}
    </div>
  );
}

function CabinNowTile({ view }: { view: CabinAnalysisView }) {
  const now = summarizeCabinNow(view);
  return (
    <Tile label="Cabin now" question="Is the air OK?">
      {now.driver === null ? (
        <>
          <p className="kpi__value">
            <TierChip status="noData" />
          </p>
          <p className="muted small">There is no cabin data in LIVE mode.</p>
        </>
      ) : now.breach ? (
        <>
          <p className="kpi__value">
            <TierChip status={now.status} />
          </p>
          <p className="kpi__text">
            {shortLabel(now.driver.def)} {formatValue(now.driver.latest!, now.driver.def.unit)}
          </p>
          <p className="muted small">{breachText(now.driver.def, now.breach)}.</p>
        </>
      ) : (
        <>
          <p className="kpi__value">
            <TierChip status="none" label="Within limits" />
          </p>
          <p className="kpi__text">Within NASA limits</p>
          <p className="muted small">CO2, temperature and humidity are all inside their ranges.</p>
        </>
      )}
    </Tile>
  );
}

function OutlookTile({ view }: { view: CabinAnalysisView }) {
  const out = summarizeOutlook(view);
  return (
    <Tile label="Next 6 h" question="Will it stay OK?">
      {out.kind === 'alert' ? (
        <>
          <p className="kpi__value">
            <TierChip status="information" />
          </p>
          <p className="kpi__text">
            {shortLabel(out.variable.def)} may {out.alert.side === 'above' ? 'exceed' : 'fall below'} the NASA limit within ~{out.alert.horizonH} h
          </p>
          <p className="muted small">A statistical forecast for awareness, not a diagnosis.</p>
        </>
      ) : out.kind === 'clear' ? (
        <>
          <p className="kpi__value kpi__value--plain">
            <CircleCheck size={16} aria-hidden="true" /> <span className="kpi__text">No limit crossing forecast</span>
          </p>
          <p className="muted small">The 80% intervals stay inside the NASA limits.</p>
        </>
      ) : (
        <>
          <p className="kpi__text">No forecast available</p>
          <p className="muted small">A forecast needs recent cabin data and a validated horizon.</p>
        </>
      )}
    </Tile>
  );
}

function CrewTile({ view, cause, onCause }: { view: CabinAnalysisView; cause: Verdict | null; onCause(v: Verdict | null): void }) {
  const counts = countItemsByVerdict(view);
  const readings = countByVerdict(view.analysis.findings);
  const items = CAUSES.reduce((n, c) => n + counts[c.verdict], 0);
  const total = view.analysis.findings.length;
  return (
    <Tile label="Crew" question="Who needs attention, and why?">
      <p className="kpi__text">
        {items} to review <span className="muted small">from {total} atypical reading{total === 1 ? '' : 's'}</span>
      </p>
      <div className="kpi__causes" role="group" aria-label="Filter the list by cause">
        {CAUSES.map(({ verdict, label }) => (
          <button
            key={verdict}
            type="button"
            className="cause"
            aria-pressed={cause === verdict}
            aria-label={`${label} ${counts[verdict]}`}
            title={`${counts[verdict]} item${counts[verdict] === 1 ? '' : 's'}, ${readings[verdict]} reading${readings[verdict] === 1 ? '' : 's'}`}
            onClick={() => onCause(cause === verdict ? null : verdict)}
          >
            {VERDICT_ICON[verdict]}
            <span>{label}</span>
            <strong>{counts[verdict]}</strong>
          </button>
        ))}
      </div>
      <p className="muted small">
        {view.analysis.membersAnalyzed} crew, last {view.spanDays} days
      </p>
    </Tile>
  );
}

function RadiationTile({ view }: { view: CabinAnalysisView }) {
  const r = summarizeRadiation(view);
  return (
    <Tile label="Radiation" question="Mission dose against the career limit">
      {r === null ? (
        <>
          <p className="kpi__value">
            <TierChip status="noData" />
          </p>
          <p className="muted small">There is no dose data in LIVE mode.</p>
        </>
      ) : (
        <>
          <p className="kpi__text">
            {percentText(r.percent)} <span className="muted small">of the career limit</span>
          </p>
          <div
            className="kpi__meter"
            role="meter"
            aria-label="Mission radiation dose against the career limit"
            aria-valuemin={0}
            aria-valuemax={r.limit}
            aria-valuenow={Math.round(r.dose * 10) / 10}
            aria-valuetext={`${percentText(r.percent)}, ${formatValue(r.dose, r.unit)} of ${formatValue(r.limit, r.unit)}`}
            style={tierStyle('information')}
          >
            <span style={{ width: `${Math.max(r.percent, 1)}%` }} />
          </div>
          <p className="small">
            {formatValue(r.dose, r.unit)} / {formatValue(r.limit, r.unit)}
          </p>
          <p className="muted small">Context, not an acute cause. The running total covers this mission only; the limit counts all flights.</p>
        </>
      )}
    </Tile>
  );
}

/** The four key indicators of the status board. The crew tile's counts filter the "Needs attention" list. */
export function CabinKpiRow({ view, cause, onCause }: { view: CabinAnalysisView; cause: Verdict | null; onCause(v: Verdict | null): void }) {
  return (
    <section aria-label="Key indicators" className="kpi-row">
      <CabinNowTile view={view} />
      <OutlookTile view={view} />
      <CrewTile view={view} cause={cause} onCause={onCause} />
      <RadiationTile view={view} />
    </section>
  );
}
