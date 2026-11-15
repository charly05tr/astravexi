import { ArrowLeft, ArrowSquareOut, Flag } from '@phosphor-icons/react';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { SourceBadge } from '../../ui/Badge';
import { EmptyState } from '../../ui/Panel';
import { TierChip, tierStyle } from '../../ui/TierChip';
import type { CorroborationView, FindingView, IndicatorView, ZonePanelModel } from './zone-panel-model';

const TrendChart = lazy(() => import('./TrendChart'));

export interface ZonePanelProps {
  model: ZonePanelModel;
  /** Mode copy for an empty LIVE zone. */
  isLive: boolean;
  /** True when the user picked this zone; false when the panel follows the highest-priority zone. */
  focused: boolean;
  onBack(): void;
  /** Routine-change suggestions for this zone (slot: the provider is async). */
  suggestions?: ReactNode;
  /** The zone-scoped reading form (slot). */
  update?: ReactNode;
}

function VerifyMark() {
  return (
    <span className="verify-mark">
      <Flag size={14} weight="bold" aria-hidden="true" />
      Needs verification
    </span>
  );
}

function Finding({ f }: { f: FindingView }) {
  return (
    <article className="finding" style={tierStyle(f.tier)} data-rule-id={f.ruleId}>
      <div className="finding__head">
        <TierChip status={f.tier} />
        <strong>{f.indicatorLabel}</strong>
        <SourceBadge source={f.source} />
        <span className="finding__rule">Rule {f.ruleId}</span>
      </div>
      {f.latched ? (
        <p className="latched">
          Warning{f.latestText ? ` - latest re-measure ${f.latestText}` : ''}. Stays active until the Crew Medical
          Officer acknowledges it.
        </p>
      ) : null}
      {f.unverified ? <p className="status-line">Unverified: there is no baseline yet.</p> : null}
      <dl className="three-part" style={{ margin: 0 }}>
        <dt>What changed</dt>
        <dd>{f.explanation.whatChanged}</dd>
        <dt>Why it matters</dt>
        <dd>{f.explanation.whyItMatters}</dd>
        <dt>What to do</dt>
        <dd>{f.explanation.whatToDo}</dd>
      </dl>
      <p className="citation">
        <span>Source:</span>
        {f.citation.url.startsWith('http') ? (
          <a href={f.citation.url} target="_blank" rel="noreferrer">
            {f.citation.label} <ArrowSquareOut size={12} aria-hidden="true" />
          </a>
        ) : (
          <span>{f.citation.label}</span>
        )}
        {f.needsVerification ? <VerifyMark /> : null}
      </p>
    </article>
  );
}

function Corroboration({ c }: { c: CorroborationView }) {
  return (
    <article className="finding" style={tierStyle('caution')} data-testid="corroboration">
      <div className="finding__head">
        <TierChip status="caution" />
        <strong>{c.title}</strong>
      </div>
      <dl className="three-part" style={{ margin: 0 }}>
        <dt>What changed</dt>
        <dd>
          {c.intro}
          <ul>
            {c.contributing.map((x) => (
              <li key={x.key}>
                {x.indicatorLabel}, rule {x.ruleId}
              </li>
            ))}
          </ul>
        </dd>
        <dt>Why it matters</dt>
        <dd>{c.whyItMatters}</dd>
        <dt>What to do</dt>
        <dd>{c.whatToDo}</dd>
      </dl>
    </article>
  );
}

/** One indicator as a chart card: title and latest value on top, the 30-day line below, then the legend. */
function IndicatorRow({ ind }: { ind: IndicatorView }) {
  const hasManual = ind.trend.points.some((p) => p.source === 'MANUAL');
  return (
    <li className="indicator">
      <div className="indicator__head">
        <div>
          <strong>{ind.label}</strong>
          {ind.last ? (
            <p className="indicator__state">
              Last reading {ind.last.time}
              {ind.last.afterExercise ? ', after exercise' : ''}
            </p>
          ) : null}
          {ind.notes.map((n) => (
            <p className="indicator__state" key={n}>
              {n}
            </p>
          ))}
        </div>
        {ind.last ? (
          <span className="indicator__value">
            {ind.last.text} <SourceBadge source={ind.last.source} />
          </span>
        ) : null}
      </div>
      {ind.trend.points.length > 0 ? (
        <>
          <Suspense fallback={<div className="trend" />}>
            <TrendChart
              points={ind.trend.points}
              baseline={ind.trend.baseline}
              label={ind.label}
              precision={ind.precision}
              unit={ind.unit}
            />
          </Suspense>
          <ul className="trend__legend">
            <li className="trend__key">
              <span className="legend-line" aria-hidden="true" />
              Daily reading, last {ind.trend.points.length} days
            </li>
            {hasManual ? (
              <li className="trend__key">
                <svg width="12" height="12" aria-hidden="true">
                  <polygon className="dot-manual" points="6,1 11,6 6,11 1,6" />
                </svg>
                MANUAL
              </li>
            ) : null}
            {ind.trend.baseline !== null ? (
              <li className="trend__key">
                <span className="legend-line legend-line--dashed" aria-hidden="true" />
                Your baseline
              </li>
            ) : null}
          </ul>
        </>
      ) : null}
      <p className="field__hint">How to measure: {ind.howToMeasure}</p>
    </li>
  );
}

/** Presentational zone panel: no store access. Everything it shows comes in through `model` and the slots. */
export function ZonePanel({ model, isLive, focused, onBack, suggestions, update }: ZonePanelProps) {
  const hasFindings = model.findings.length > 0 || model.corroboration !== null;
  return (
    <section className="zone-panel" aria-labelledby="zone-panel-title" data-zone-id={model.zoneId} style={tierStyle(model.status)}>
      <div className="zone-panel__head">
        <div className="zone-panel__heading">
          <p className="eyebrow">{focused ? 'Focused zone' : 'Highest priority now'}</p>
          <h2 id="zone-panel-title">{model.label}</h2>
        </div>
        <TierChip status={model.status} />
      </div>
      {focused ? (
        <button type="button" className="link-button" onClick={onBack}>
          <ArrowLeft size={14} weight="bold" aria-hidden="true" />
          Full body
          <kbd>Esc</kbd>
        </button>
      ) : null}
      <p className="zone-panel__summary">{model.functionSummary}</p>

      {!model.monitored ? (
        <EmptyState>
          Not monitored in this prototype. No indicator feeds this zone, so it shows no alert, trend or score.
        </EmptyState>
      ) : (
        <>
          <section className="zone-section" aria-labelledby="zone-indicators">
            <h3 id="zone-indicators">Indicators</h3>
            <ul className="indicator-list">
              {model.indicators.map((i) => (
                <IndicatorRow key={i.id} ind={i} />
              ))}
            </ul>
          </section>

          {suggestions}

          <section className="zone-section" aria-labelledby="zone-why">
            <h3 id="zone-why">Why this status</h3>
            {!hasFindings ? (
              <EmptyState>
                {model.status === 'noData'
                  ? isLive
                    ? 'No readings yet. Add your first check-in.'
                    : 'No recent reading. Add a check-in.'
                  : 'No active findings in this zone.'}
              </EmptyState>
            ) : (
              <div className="stack">
                {model.corroboration ? <Corroboration c={model.corroboration} /> : null}
                {model.findings.map((f) => (
                  <Finding key={f.key} f={f} />
                ))}
              </div>
            )}
          </section>

          {update}
        </>
      )}
    </section>
  );
}
