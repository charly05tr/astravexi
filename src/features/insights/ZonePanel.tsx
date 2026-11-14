import { ArrowSquareOut, Flag } from '@phosphor-icons/react';
import { lazy, Suspense } from 'react';
import { SourceBadge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/Panel';
import { TierChip, tierStyle } from '../../ui/TierChip';
import type { CorroborationView, FindingView, IndicatorView, ProposalView, ZonePanelModel } from './zone-panel-model';

const TrendChart = lazy(() => import('./TrendChart'));

export interface ZonePanelProps {
  model: ZonePanelModel;
  /** Mode copy for an empty LIVE zone. */
  isLive: boolean;
  onDecide(recommendationId: string, findingKey: string, decision: 'accepted' | 'dismissed'): void;
}

function VerifyMark() {
  return (
    <span className="verify-mark">
      <Flag size={14} weight="bold" aria-hidden="true" />
      Needs verification
    </span>
  );
}

function Proposals({
  proposals,
  findingKey,
  onDecide,
}: {
  proposals: ProposalView[];
  findingKey: string;
  onDecide: ZonePanelProps['onDecide'];
}) {
  if (proposals.length === 0) return null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {proposals.map(({ recommendation: r, decision }) => (
        <div className="proposal" key={r.id}>
          <p className="proposal__title">Proposed routine change: {r.title}</p>
          <ul>
            {r.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="citation">
            <span>Evidence: {r.evidence.label}</span>
            {r.needsVerification ? <VerifyMark /> : null}
          </p>
          {decision === 'accepted' ? (
            <p className="status-line">Accepted</p>
          ) : (
            <div className="proposal__actions">
              <Button size="small" variant="primary" onClick={() => onDecide(r.id, findingKey, 'accepted')}>
                Accept
              </Button>
              <Button size="small" onClick={() => onDecide(r.id, findingKey, 'dismissed')}>
                Dismiss
              </Button>
              <span className="muted">Optional. Your choice never changes the alert.</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Finding({ f, onDecide }: { f: FindingView; onDecide: ZonePanelProps['onDecide'] }) {
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
      <Proposals proposals={f.proposals} findingKey={f.key} onDecide={onDecide} />
    </article>
  );
}

function Corroboration({ c, onDecide }: { c: CorroborationView; onDecide: ZonePanelProps['onDecide'] }) {
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
      <Proposals proposals={c.proposals} findingKey={c.findingKey} onDecide={onDecide} />
    </article>
  );
}

function IndicatorRow({ ind }: { ind: IndicatorView }) {
  return (
    <li className="indicator">
      <div className="indicator__head">
        <strong>{ind.label}</strong>
        {ind.last ? (
          <span className="indicator__value">
            {ind.last.text} <SourceBadge source={ind.last.source} />
          </span>
        ) : null}
      </div>
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
      {ind.trend.points.length > 0 ? (
        <>
          <Suspense fallback={<div className="trend" />}>
            <TrendChart points={ind.trend.points} baseline={ind.trend.baseline} label={ind.label} precision={ind.precision} />
          </Suspense>
          <div className="trend__legend">
            <span className="trend__key">
              <svg width="12" height="12" aria-hidden="true">
                <circle className="dot-synthetic" cx="6" cy="6" r="4" />
              </svg>
              SYNTHETIC
            </span>
            <span className="trend__key">
              <svg width="12" height="12" aria-hidden="true">
                <polygon className="dot-manual" points="6,1 11,6 6,11 1,6" />
              </svg>
              MANUAL
            </span>
            {ind.trend.baseline !== null ? <span>Dashed line: your baseline</span> : null}
          </div>
        </>
      ) : null}
      <p className="field__hint">How to measure: {ind.howToMeasure}</p>
    </li>
  );
}

/** Presentational zone panel: no store access. Everything it shows comes in through `model`. */
export function ZonePanel({ model, isLive, onDecide }: ZonePanelProps) {
  return (
    <section className="panel zone-panel" aria-labelledby="zone-panel-title" data-zone-id={model.zoneId}>
      <div className="zone-panel__head">
        <h2 id="zone-panel-title">{model.label}</h2>
        <TierChip status={model.status} />
      </div>
      <p>{model.functionSummary}</p>

      {!model.monitored ? (
        <div style={{ marginTop: 12 }}>
          <EmptyState>
            Not monitored in this prototype. No indicator feeds this zone, so it shows no alert, trend or score.
          </EmptyState>
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 12 }}>
          {model.findings.length === 0 && !model.corroboration ? (
            <EmptyState>
              {model.status === 'noData'
                ? isLive
                  ? 'No readings yet. Add your first check-in.'
                  : 'No recent reading. Add a check-in.'
                : 'No active findings in this zone.'}
            </EmptyState>
          ) : null}
          {model.corroboration ? <Corroboration c={model.corroboration} onDecide={onDecide} /> : null}
          {model.findings.map((f) => (
            <Finding key={f.key} f={f} onDecide={onDecide} />
          ))}
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Indicators</h3>
            <ul className="indicator-list">
              {model.indicators.map((i) => (
                <IndicatorRow key={i.id} ind={i} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
