import { Wind } from 'lucide-react';
import { CO2_OPS_LIMITS } from '../../core/environment/co2';
import type { CabinEnvironmentView } from '../../core/use-cases/environment';
import { SourceBadge } from '../../ui/Badge';
import { EmptyState, Panel } from '../../ui/Panel';
import { Sparkline } from '../../ui/Sparkline';
import { TierChip } from '../../ui/TierChip';

const ppm = (n: number) => `${Math.round(n).toLocaleString('en-US')} ppm`;
const mmHg = (n: number) => `${n.toFixed(2)} mmHg`;
const day = (iso: string) => iso.slice(0, 10);

const POSITION_TEXT = { below: 'below', at: 'at', above: 'above' } as const;

/** The simulated cabin CO2 against the NASA ISS reference threshold. Presentational: no store access. */
export function CabinCo2Panel({ view }: { view: CabinEnvironmentView }) {
  const { simulated, reference, assessment } = view;
  const ref = reference.status === 'unavailable' ? null : reference;
  return (
    <Panel
      id="cabin-co2"
      title="Cabin CO2"
      icon={<Wind size={18} aria-hidden="true" />}
      hint="Simulated cabin air compared with a threshold taken from real ISS mission telemetry."
    >
      {simulated && assessment ? (
        <div className="item">
          <span className="eyebrow">
            Our cabin, now <SourceBadge source="SYNTHETIC" />
          </span>
          <p>
            <strong>{ppm(assessment.valuePpm)}</strong> ({mmHg(assessment.valueMmHg)}) <TierChip status={assessment.status} />
          </p>
          <p className="muted small">
            {Math.abs(assessment.deltaPpm).toLocaleString('en-US')} ppm {POSITION_TEXT[assessment.position]} the NASA ISS reference
            threshold{assessment.position === 'at' ? ' (within 50 ppm)' : ''}.
          </p>
          <Sparkline values={simulated.readings.map((r) => r.ppm)} baseline={assessment.thresholdPpm} width={320} height={64} />
          <p className="muted small">Last 48 hours, simulated. The line is the reference threshold.</p>
        </div>
      ) : simulated ? (
        <p className="muted">
          Our cabin, now: <strong>{ppm(simulated.latest.ppm)}</strong> <SourceBadge source="SYNTHETIC" />. No reference to compare with.
        </p>
      ) : (
        <EmptyState>There is no simulated cabin CO2 in LIVE mode.</EmptyState>
      )}

      <div className="item">
        <span className="eyebrow">NASA ISS reference: historical mission telemetry</span>
        {ref ? (
          <>
            <p>
              Threshold <strong>{ppm(ref.reference.thresholdPpm)}</strong>: the 95th percentile of ISS cabin CO2 during mission{' '}
              {ref.reference.mission} ({day(ref.reference.from)} to {day(ref.reference.to)}, {ref.reference.count.toLocaleString('en-US')} samples).
            </p>
            <p className="muted small">
              Typical {ppm(ref.reference.medianPpm)}, mean {ppm(ref.reference.meanPpm)}, maximum {ppm(ref.reference.maxPpm)}. Ops limits for
              reference: attention {mmHg(CO2_OPS_LIMITS.attention.mmHg)} ({ppm(CO2_OPS_LIMITS.attention.ppm)}), high{' '}
              {mmHg(CO2_OPS_LIMITS.high.mmHg)} ({ppm(CO2_OPS_LIMITS.high.ppm)}).
            </p>
            <p className="muted small" role="status">
              {ref.status === 'cached'
                ? `Offline: showing the copy saved on ${ref.fetchedAt.slice(0, 16).replace('T', ' ')} UTC.`
                : ref.status === 'saved'
                  ? `Saved on ${ref.fetchedAt.slice(0, 16).replace('T', ' ')} UTC${ref.stale ? '; refreshing from NASA.' : '.'}`
                  : `Updated ${ref.fetchedAt.slice(0, 16).replace('T', ' ')} UTC.`}
            </p>
          </>
        ) : (
          <p className="banner" role="alert">
            The NASA ISS reference is unavailable ({reference.status === 'unavailable' ? reference.message : ''}) and nothing is saved on this
            device yet. No comparison is shown.
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
    </Panel>
  );
}
