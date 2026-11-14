import { ArrowSquareOut, Flag } from '@phosphor-icons/react';
import { useAppContext, useAppState } from '../../app/app-context';
import { useBrand } from '../../brand/brand-context';
import { Badge } from '../../ui/Badge';
import { Panel } from '../../ui/Panel';
import { TierChip } from '../../ui/TierChip';
import { risks } from '../../knowledge';

function Link({ url, children }: { url: string; children: string }) {
  if (!url.startsWith('http')) return <span>{children}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {children} <ArrowSquareOut size={12} aria-hidden="true" />
    </a>
  );
}

/** Every rule with its citation and verification flag, the synthetic-data disclosure, licenses and credits. */
export function SourcesView() {
  const { knowledge, content } = useAppContext();
  const brand = useBrand();
  const mode = useAppState((s) => s.mode);
  const indicators = new Map(knowledge.indicators.map((i) => [i.id, i.label]));
  const flagged = knowledge.rules.filter((r) => r.needsVerification).length;

  return (
    <div className="sources" id="sources">
      <h1 style={{ fontSize: '1.6rem' }}>Sources and disclosures</h1>

      <Panel id="disclosure" title="Decision support, not medical advice">
        <p>
          Thresholds come from the project research report and the cited sources. They are decision support only and
          need validation by flight surgeons before any real use. This prototype does not diagnose, does not screen
          for self-harm, and the Earth link is simulated.
        </p>
      </Panel>

      <Panel id="synthetic" title="Synthetic data disclosure">
        <p>
          In DEMO mode the crew member is synthetic. The demo generates the drift it then detects: sleep, mood and
          heart-rate changes are seeded on purpose, and the rules fire on them. That is circular by design, so it shows
          how the app behaves, not that the thresholds are right. Live manual entry is provided as the check.
          {mode === 'demo' ? ' You are in DEMO mode: every seeded point is labeled SYNTHETIC.' : ' You are in LIVE mode: no synthetic data is shown.'}
        </p>
      </Panel>

      <Panel id="rules" title="Rules and citations" hint={`${knowledge.rules.length} rules, ${flagged} flagged as needing verification.`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Rule</th>
                <th scope="col">Indicator</th>
                <th scope="col">Tier</th>
                <th scope="col">Source</th>
                <th scope="col">Verification</th>
              </tr>
            </thead>
            <tbody>
              {knowledge.rules.map((r) => (
                <tr key={r.id} data-rule-id={r.id}>
                  <td>
                    <span className="mono">{r.id}</span>
                    <br />
                    <span className="muted">{r.description}</span>
                  </td>
                  <td>{indicators.get(r.indicatorId) ?? r.indicatorId}</td>
                  <td>
                    <TierChip status={r.tier} />
                  </td>
                  <td>
                    <Link url={r.source.url}>{r.source.label}</Link>
                    <br />
                    <span className="muted">{r.source.kind}</span>
                  </td>
                  <td>
                    {r.needsVerification ? (
                      <span className="verify-mark">
                        <Flag size={14} weight="bold" aria-hidden="true" />
                        Needs verification
                      </span>
                    ) : (
                      <span className="muted">Verified against its source</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel id="risks" title="Human Research Program risks" hint="The zone-to-risk mapping marked as inference is a team proposal, not NASA content.">
        <ul className="item-list">
          {risks.map((r) => (
            <li key={r.id}>
              <Link url={r.source.url}>{r.name}</Link>{' '}
              {r.mappingIsInference ? <Badge variant="dashed">Mapping is inference</Badge> : null}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel id="credits" title="Licenses and credits">
        <ul className="item-list">
          {content.attributions.map((a) => (
            <li key={a.id}>
              <Link url={a.url}>{a.name}</Link> <span className="muted">- {a.license}. {a.use}.</span>
            </li>
          ))}
        </ul>
        <p style={{ marginTop: 12 }}>
          Event credit: {brand.eventLabel}. This prototype uses no NASA insignia and is not a NASA product.
        </p>
      </Panel>
    </div>
  );
}
