import { ChevronDown, ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';
import type { CabinAnalysisView, CabinVariableView } from '../../core/use-cases/cabin-analysis';
import { TierChip, tierStyle } from '../../ui/TierChip';
import { forecastNumber, formatValue } from './analysis-model';
import { airVariables, meterLayout } from './cabin-board-model';
import type { MeterLayout } from './cabin-board-model';
import { VariableChart } from './VariableChart';

function rangeText(v: CabinVariableView): string {
  const { def } = v;
  const fmt = (x: { min?: number; max?: number }) =>
    x.min !== undefined && x.max !== undefined
      ? `${x.min} to ${formatValue(x.max, def.unit)}`
      : x.max !== undefined
        ? `up to ${formatValue(x.max, def.unit)}`
        : `from ${formatValue(x.min!, def.unit)}`;
  const r = def.operating;
  return `NASA limit ${r ? fmt(r) : 'none'}${def.comfort ? `; comfort zone ${fmt(def.comfort)}` : ''}`;
}

const pct = (f: number) => `${(f * 100).toFixed(2)}%`;

/** A horizontal track with the NASA range, the lighter comfort band and a marker at the current value. Decorative: the row says it in words. */
function Track({ layout, status, referenceLabel }: { layout: MeterLayout; status: CabinVariableView['status']; referenceLabel?: string }) {
  const seg = (s: { from: number; to: number } | null) => (s ? { left: pct(s.from), width: pct(Math.max(0, s.to - s.from)) } : undefined);
  return (
    <div className="air__track" aria-hidden="true">
      {layout.operating ? <span className="air__range" style={{ ...seg(layout.operating), ...tierStyle('none') }} /> : null}
      {layout.comfort ? <span className="air__comfort" style={{ ...seg(layout.comfort), ...tierStyle('none') }} /> : null}
      {layout.reference !== null ? <span className="air__ref" style={{ left: pct(layout.reference) }} title={referenceLabel} /> : null}
      {layout.marker !== null ? <span className="air__marker" style={{ left: pct(layout.marker), ...tierStyle(status) }} /> : null}
    </div>
  );
}

function Row({ v, simulated, issP95 }: { v: CabinVariableView; simulated: boolean; issP95: number | null }) {
  const { def } = v;
  const [open, setOpen] = useState(false);
  const chartId = useId();
  const hasData = v.latest !== null;
  const reference = def.id === 'co2' ? issP95 : null;
  const layout = meterLayout(def, v.latest, reference);

  return (
    <li className="air-row" data-variable={def.id}>
      <div className="air__grid">
        <span className="air__name">{def.label}</span>
        {hasData ? (
          <>
            <Track layout={layout} status={v.status} referenceLabel={reference !== null ? `ISS typical (p95) ${formatValue(reference, def.unit)}` : undefined} />
            <span className="air__value">
              <strong>{formatValue(v.latest!, def.unit)}</strong> <TierChip status={v.status} label={v.status === 'none' ? 'Within limits' : undefined} />
            </span>
          </>
        ) : (
          <>
            <span />
            <span className="air__value">
              <TierChip status="noData" />
            </span>
          </>
        )}
      </div>
      <p className="muted small">{rangeText(v)}.</p>
      {reference !== null && hasData ? (
        <p className="muted small">
          <span className="air__ref-key" aria-hidden="true" /> ISS typical (p95): {formatValue(reference, def.unit)}. For comparison only; the NASA limit is the
          decision threshold.
        </p>
      ) : null}
      {!hasData ? (
        <>
          <p className="muted small">{simulated ? 'No recent cabin reading.' : 'No data: this variable has no real source in LIVE mode.'}</p>
          <p className="muted small">No forecast: a forecast needs recent cabin data.</p>
        </>
      ) : v.forecast.length > 0 ? (
        <ul className="forecast__list" aria-label={`${def.label} forecast, 80% prediction interval`}>
          {v.forecast.map((p) => (
            <li key={p.horizonH} data-horizon={p.horizonH}>
              In {p.horizonH} h: {formatValue(forecastNumber(p.variable, p.value), def.unit)}{' '}
              <span className="muted small">
                ({formatValue(forecastNumber(p.variable, p.low), '')
                  .trim()}{' '}
                to {formatValue(forecastNumber(p.variable, p.high), def.unit)})
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {hasData ? (
        <>
          <button type="button" className="link-button air__toggle" aria-expanded={open} aria-controls={chartId} onClick={() => setOpen(!open)}>
            {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
            48 h chart<span className="sr-only">: {def.label}</span>
          </button>
          <div id={chartId} hidden={!open}>
            {open ? <VariableChart v={v} /> : null}
          </div>
        </>
      ) : null}
    </li>
  );
}

/**
 * "Cabin air": one meter row per variable with an instantaneous NASA limit. Radiation is the key-indicator tile, not a row.
 * `issP95` is the real ISS CO2 reference, shown on the CO2 row only as a secondary tick.
 */
export function CabinAir({ view, issP95 }: { view: CabinAnalysisView; issP95: number | null }) {
  return (
    <section className="board__section" aria-labelledby="cabin-air-title">
      <h3 id="cabin-air-title" className="board__title">
        Cabin air
      </h3>
      <p className="muted small">Each marker is the latest value against the NASA operating range (darker band) and the comfort zone (lighter band).</p>
      <ul className="item-list" aria-label="Cabin air variables">
        {airVariables(view).map((v) => (
          <Row key={v.def.id} v={v} simulated={view.simulated} issP95={issP95} />
        ))}
      </ul>
    </section>
  );
}
