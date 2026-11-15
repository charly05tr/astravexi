import type { ReactNode } from 'react';
import { useState } from 'react';
import { useUi } from '../../app/ui-state';
import type { AttributedReading } from '../../core/attribution/analyze';
import type { Verdict } from '../../core/attribution/model';
import type { CabinAnalysisView } from '../../core/use-cases/cabin-analysis';
import { Badge } from '../../ui/Badge';
import { Dialog } from '../../ui/Dialog';
import { EmptyState } from '../../ui/Panel';
import { TierChip } from '../../ui/TierChip';
import { REASON_TEXT, VERDICT_LABEL, crewText, environmentText, formatValue, missionTimeLabel, personalText } from './analysis-model';
import { CAUSES, buildAttention, breachText, findingTitle, groupHeadline, personHeadline, shortLabel } from './cabin-board-model';
import type { AttentionItem, CabinAttention, ForecastAttention, GroupAttention, PersonAttention } from './cabin-board-model';
import { VERDICT_ICON } from './CabinKpiRow';

function VerdictChip({ verdict }: { verdict: Verdict }) {
  return (
    <Badge variant={verdict === 'insufficient-data' ? 'dashed' : 'solid'}>
      {VERDICT_ICON[verdict]} {VERDICT_LABEL[verdict]}
    </Badge>
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

/** A link-styled button that opens the crew member's detail page. */
function PersonLink({ f, children }: { f: AttributedReading; children?: ReactNode }) {
  const { selectCrewMember, setView } = useUi();
  return (
    <button
      type="button"
      className="link-button"
      onClick={() => {
        selectCrewMember(f.profileId);
        setView('dashboard');
      }}
    >
      {children ?? f.name}
    </button>
  );
}

/** The three signals behind one verdict, with the citation of the documented link. */
function WhyDialog({ f, onClose }: { f: AttributedReading; onClose(): void }) {
  return (
    <Dialog
      title={`${f.name}: ${f.indicatorLabel}`}
      eyebrow="Why this reading is flagged"
      aside={<VerdictChip verdict={f.verdict} />}
      onClose={onClose}
      closeLabel="Close explanation"
      style={{ width: 'min(640px, 92vw)' }}
    >
      <p className="small">
        {formatValue(f.value, f.unit)} on {missionTimeLabel(f.t)}. {REASON_TEXT[f.reason]}
      </p>
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
      <p className="small">
        <PersonLink f={f}>Open {f.name}&apos;s detail</PersonLink>
      </p>
      <p className="muted small">Decision support, not a diagnosis.</p>
    </Dialog>
  );
}

function Ongoing() {
  return <Badge>Ongoing</Badge>;
}

function FindingLine({ f, onWhy, compact = false, ongoing = false }: { f: AttributedReading; onWhy(f: AttributedReading): void; compact?: boolean; ongoing?: boolean }) {
  const prefix = `${f.indicatorLabel} ${formatValue(f.value, f.unit)} (usual ${formatValue(f.personal.median, f.unit)})`;
  return (
    <>
      <span className="item__head">
        <strong>
          <PersonLink f={f} /> {'·'} {prefix}
        </strong>
        {compact ? null : <VerdictChip verdict={f.verdict} />}
        {ongoing ? <Ongoing /> : null}
        <span className="item__meta">{missionTimeLabel(f.t)}</span>
      </span>
      {compact ? null : <p className="small">{REASON_TEXT[f.reason]}</p>}
      <button type="button" className="button button--small attn__why" aria-haspopup="dialog" aria-label={`Why? ${findingTitle(f)}`} onClick={() => onWhy(f)}>
        Why?
      </button>
    </>
  );
}

function CabinRow({ item }: { item: CabinAttention }) {
  const { def } = item.variable;
  const since =
    item.sinceT === null ? null : item.sinceBeforeWindow ? `for at least 48 h, since before ${missionTimeLabel(item.sinceT)}` : `since ${missionTimeLabel(item.sinceT)}`;
  return (
    <li className="item attn" data-kind="cabin" data-variable={def.id} data-status={item.status}>
      <span className="item__head">
        <TierChip status={item.status} />
        <strong>
          {shortLabel(def)} {formatValue(item.variable.latest!, def.unit)}, {breachText(def, item.breach)}
        </strong>
        {since ? <span className="item__meta">{since}</span> : null}
      </span>
      <p className="small">{item.prompt}. An operational review prompt, not medical advice.</p>
    </li>
  );
}

function ForecastRow({ item }: { item: ForecastAttention }) {
  const { def } = item.variable;
  return (
    <li className="item attn" data-kind="forecast" data-variable={def.id}>
      <span className="item__head">
        <TierChip status="information" />
        <strong>
          {shortLabel(def)} may {item.alert.side === 'above' ? 'exceed' : 'fall below'} the NASA limit of {formatValue(item.alert.limit, def.unit)} within ~
          {item.alert.horizonH} h
        </strong>
      </span>
      <p className="small">
        The {item.alert.side === 'above' ? 'upper' : 'lower'} end of the forecast interval reaches the limit. For awareness, not a diagnosis. {item.prompt}.
      </p>
    </li>
  );
}

function GroupRow({ item, crewSize, onWhy }: { item: GroupAttention; crewSize: number; onWhy(f: AttributedReading): void }) {
  return (
    <li className="item attn" data-kind="group" data-variable={item.variable}>
      <details>
        <summary>
          <span className="item__head">
            <strong>{groupHeadline(item, crewSize)}</strong>
            <VerdictChip verdict="likely-external" />
            {item.ongoing ? <Ongoing /> : null}
            <span className="item__meta">{missionTimeLabel(item.newestT)}</span>
          </span>
        </summary>
        <p className="small">{REASON_TEXT[item.findings[0]!.reason]}</p>
        <ul className="item-list attn__people" aria-label={`${item.label} excursion: readings by person`}>
          {item.findings.map((f) => (
            <li key={f.id} className="item" data-verdict={f.verdict}>
              <FindingLine f={f} onWhy={onWhy} compact />
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function PersonRow({ item, onWhy }: { item: PersonAttention; onWhy(f: AttributedReading): void }) {
  return (
    <li className="item attn" data-kind="person" data-verdict={item.verdict}>
      <details>
        <summary>
          <span className="item__head">
            <strong>{personHeadline(item)}</strong>
            <VerdictChip verdict={item.verdict} />
            {item.ongoing ? <Ongoing /> : null}
            <span className="item__meta">latest {missionTimeLabel(item.toT)}</span>
          </span>
        </summary>
        <p className="small">{REASON_TEXT[item.latest.reason]}</p>
        <ul className="item-list attn__people" aria-label={`${item.name}: ${item.latest.indicatorLabel} readings`}>
          {item.findings.map((f) => (
            <li key={f.id} className="item" data-verdict={f.verdict}>
              <FindingLine f={f} onWhy={onWhy} compact />
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

/**
 * The single "Needs attention" list: cabin variables outside their range, forecast alerts and crew findings, most
 * urgent first. Presentational: the cause filter is owned by the page.
 */
export function NeedsAttention({ view, cause, onCause }: { view: CabinAnalysisView; cause: Verdict | null; onCause(v: Verdict | null): void }) {
  const [why, setWhy] = useState<AttributedReading | null>(null);
  const items: AttentionItem[] = buildAttention(view, cause);
  const { withoutBaseline } = view.analysis;
  const causeLabel = CAUSES.find((c) => c.verdict === cause)?.label;
  return (
    <section className="board__section" aria-labelledby="needs-attention-title">
      <h3 id="needs-attention-title" className="board__title">
        Needs attention
      </h3>
      <p className="muted small">
        Cabin readings outside their range, forecast heads-ups and atypical crew readings (repeated readings of one person are grouped), most urgent first. Decision support, not a diagnosis.
      </p>
      {cause !== null ? (
        <p className="filter-row" role="status">
          <span>Showing crew readings with cause: {causeLabel}.</span>
          <button type="button" className="button button--small" onClick={() => onCause(null)}>
            Show everything
          </button>
        </p>
      ) : null}
      {items.length === 0 ? (
        <EmptyState>{cause === null ? 'Nothing needs attention.' : 'No readings with this cause.'}</EmptyState>
      ) : (
        <ul className="item-list" aria-label="Needs attention">
          {items.map((item) =>
            item.kind === 'cabin' ? (
              <CabinRow key={item.id} item={item} />
            ) : item.kind === 'forecast' ? (
              <ForecastRow key={item.id} item={item} />
            ) : item.kind === 'group' ? (
              <GroupRow key={item.id} item={item} crewSize={view.analysis.membersAnalyzed} onWhy={setWhy} />
            ) : item.kind === 'person' ? (
              <PersonRow key={item.id} item={item} onWhy={setWhy} />
            ) : (
              <li key={item.id} className="item attn" data-kind="finding" data-verdict={item.finding.verdict}>
                <FindingLine f={item.finding} onWhy={setWhy} ongoing={item.ongoing} />
              </li>
            ),
          )}
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
      {why ? <WhyDialog f={why} onClose={() => setWhy(null)} /> : null}
    </section>
  );
}
