import { Activity, CircleHelp, Home, Orbit, Thermometer } from 'lucide-react';
import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import type { AttributedReading } from '../../core/attribution/analyze';
import type { Verdict } from '../../core/attribution/model';
import type { CabinAnalysisView, CabinVariableView } from '../../core/use-cases/cabin-analysis';
import { Badge, SourceBadge } from '../../ui/Badge';
import { EmptyState, Panel } from '../../ui/Panel';
import { Sparkline } from '../../ui/Sparkline';
import { TierChip } from '../../ui/TierChip';
import {
  REASON_TEXT,
  VERDICT_LABEL,
  VERDICT_ORDER,
  countByVerdict,
  crewText,
  environmentText,
  missionTimeLabel,
  personalText,
  withUnit,
} from './analysis-model';

const VERDICT_ICON: Record<Verdict, ReactNode> = {
  'likely-external': <Orbit size={14} aria-hidden="true" />,
  'possibly-external': <Thermometer size={14} aria-hidden="true" />,
  'likely-internal': <Home size={14} aria-hidden="true" />,
  'insufficient-data': <CircleHelp size={14} aria-hidden="true" />,
};

function rangeText(v: CabinVariableView): string {
  const { def } = v;
  if (def.cumulativeLimit !== undefined) return `Career limit ${withUnit(def.cumulativeLimit, def.unit)} (all flights). Context only.`;
  const r = def.operating;
  const c = def.comfort;
  const fmt = (x: { min?: number; max?: number }) =>
    x.min !== undefined && x.max !== undefined
      ? `${x.min} to ${withUnit(x.max, def.unit)}`
      : x.max !== undefined
        ? `up to ${withUnit(x.max, def.unit)}`
        : `from ${withUnit(x.min!, def.unit)}`;
  return `NASA limit ${r ? fmt(r) : 'none'}${c ? `; comfort zone ${fmt(c)}` : ''}.`;
}

function VariableCard({ v, simulated }: { v: CabinVariableView; simulated: boolean }) {
  const { def } = v;
  return (
    <li className="item" data-variable={def.id}>
      <span className="eyebrow">
        {def.label} {simulated ? <SourceBadge source="SYNTHETIC" /> : null}
      </span>
      {v.latest === null ? (
        <p>
          <TierChip status="noData" /> <span className="muted small">No data: this variable has no real source in LIVE mode.</span>
        </p>
      ) : (
        <>
          <p>
            <strong>{withUnit(v.latest, def.unit)}</strong> <TierChip status={v.status} />
          </p>
          {def.contextOnly ? null : <Sparkline values={v.trend} width={220} height={40} />}
        </>
      )}
      <p className="muted small">{rangeText(v)}</p>
      <p className="muted small">
        Source:{' '}
        <a href={def.source.url} target="_blank" rel="noreferrer">
          {def.source.label}
        </a>
        {def.needsVerification ? ' (needs verification by flight surgeons)' : ''}.
      </p>
      {def.contextOnly ? <p className="muted small">{def.note}</p> : null}
    </li>
  );
}

/** The cabin variables against their NASA limits. Presentational: no store access. */
export function CabinVariablesPanel({ view }: { view: CabinAnalysisView }) {
  return (
    <Panel
      id="cabin-variables"
      title="Cabin variables"
      icon={<Activity size={18} aria-hidden="true" />}
      hint="Our simulated cabin against NASA operating limits, last 48 hours. Status is a tier, never a score."
    >
      {view.simulated ? null : <p className="banner">There are no simulated cabin values in LIVE mode, so nothing is shown here until a real source exists.</p>}
      <ul className="item-list" aria-label="Cabin variables">
        {view.variables.map((v) => (
          <VariableCard key={v.def.id} v={v} simulated={view.simulated} />
        ))}
      </ul>
    </Panel>
  );
}

function Signal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="signal">
      <dt className="eyebrow">{title}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Finding({ f }: { f: AttributedReading }) {
  return (
    <li className="item" data-verdict={f.verdict}>
      <details>
        <summary>
          <span className="item__head">
            <strong>
              {f.name}: {f.indicatorLabel} {withUnit(f.value, f.unit)}
            </strong>
            <Badge variant={f.verdict === 'insufficient-data' ? 'dashed' : 'solid'}>
              {VERDICT_ICON[f.verdict]} {VERDICT_LABEL[f.verdict]}
            </Badge>
            <span className="item__meta">{missionTimeLabel(f.t)}</span>
          </span>
        </summary>
        <p className="small">{REASON_TEXT[f.reason]}</p>
        <dl className="signals">
          <Signal title="1. Personal deviation">{personalText(f)}</Signal>
          <Signal title="2. Crew comparison">
            {crewText(f.crew)}
            {f.crew.peers.length > 0 ? (
              <ul className="small muted">
                {f.crew.peers.map((p) => (
                  <li key={p.profileId}>
                    {p.name}: {p.hasData ? (p.deviates ? 'moved the same way' : 'did not move the same way') : 'no usable data'}
                  </li>
                ))}
              </ul>
            ) : null}
          </Signal>
          <Signal title="3. Environmental link">
            {environmentText(f.environment)}
            {f.environment.status === 'linked-excursion' ? (
              <ul className="small muted">
                {f.environment.excursions.map((e) => (
                  <li key={`${e.variable}:${e.side}`}>
                    {e.link.effect}{' '}
                    <a href={e.link.source.url} target="_blank" rel="noreferrer">
                      {e.link.source.label}
                    </a>
                    {e.link.needsVerification ? ' (needs verification)' : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </Signal>
        </dl>
      </details>
    </li>
  );
}

type Filter = Verdict | 'all';

/** Atypical readings of the crew with their verdict and the three signals. Presentational: no store access. */
export function AtypicalReadingsPanel({ view }: { view: CabinAnalysisView }) {
  const [filter, setFilter] = useState<Filter>('all');
  const groupId = useId();
  const { findings, withoutBaseline } = view.analysis;
  const counts = countByVerdict(findings);
  const shown = filter === 'all' ? findings : findings.filter((f) => f.verdict === filter);
  return (
    <Panel
      id="atypical-readings"
      title="Atypical readings"
      icon={<Activity size={18} aria-hidden="true" />}
      hint={`Readings far from that person's own history in the last ${view.spanDays} days, and whether the cause looks external or internal. Decision support, not a diagnosis.`}
    >
      <div role="group" aria-labelledby={groupId} className="filter-row">
        <span id={groupId} className="eyebrow">
          Show
        </span>
        <button type="button" className="button button--small" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          All ({findings.length})
        </button>
        {VERDICT_ORDER.map((v) => (
          <button key={v} type="button" className="button button--small" aria-pressed={filter === v} onClick={() => setFilter(v)}>
            {VERDICT_LABEL[v]} ({counts[v]})
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState>{findings.length === 0 ? 'No atypical readings in this period.' : 'No readings with this verdict.'}</EmptyState>
      ) : (
        <ul className="item-list" aria-label="Atypical readings">
          {shown.map((f) => (
            <Finding key={f.id} f={f} />
          ))}
        </ul>
      )}
      {withoutBaseline > 0 ? (
        <p className="muted small" role="status">
          {withoutBaseline} reading{withoutBaseline === 1 ? '' : 's'} could not be judged yet: too little earlier history for that person.
        </p>
      ) : null}
      {view.unavailable.length > 0 ? (
        <p className="banner" role="alert">
          Records could not be read for: {view.unavailable.join(', ')}.
        </p>
      ) : null}
    </Panel>
  );
}
