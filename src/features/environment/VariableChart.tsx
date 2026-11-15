import { useId, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { CabinVariableView } from '../../core/use-cases/cabin-analysis';
import { tierStyle } from '../../ui/TierChip';
import { clockLabel, formatValue, missionDay, missionTimeLabel } from './analysis-model';
import { breachText, chartDomain, hourlyRows, nearestIndex, niceTicks, rangeBreach, timeTicks } from './cabin-board-model';

const W = 640;
const H = 220;
const M = { l: 56, r: 16, t: 12, b: 30 };

const tickLabel = (t: number): string => (t % 1440 === 0 ? `Day ${missionDay(t)}` : clockLabel(t));

/**
 * The last 48 hours of one cabin variable as a line with the NASA limit drawn on it, a crosshair with a tooltip on
 * hover and on keyboard focus (left and right arrows), and a table view with the same values. Presentational.
 */
export function VariableChart({ v }: { v: CabinVariableView }) {
  const { def, trend, trendT } = v;
  const [mode, setMode] = useState<'chart' | 'table'>('chart');
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();
  if (trend.length < 2) return <p className="muted small">Not enough data to draw a chart.</p>;

  const [t0, t1] = [trendT[0]!, trendT[trendT.length - 1]!];
  const [d0, d1] = chartDomain(def, trend);
  const x = (t: number) => M.l + ((t - t0) / (t1 - t0)) * (W - M.l - M.r);
  const y = (val: number) => M.t + (1 - (val - d0) / (d1 - d0)) * (H - M.t - M.b);
  const line = trend.map((val, i) => `${i === 0 ? 'M' : 'L'}${x(trendT[i]!).toFixed(1)} ${y(val).toFixed(1)}`).join(' ');
  const area = `${line} L${x(t1).toFixed(1)} ${y(d0).toFixed(1)} L${x(t0).toFixed(1)} ${y(d0).toFixed(1)} Z`;
  const op = def.operating;
  const bandTop = op?.max !== undefined ? y(op.max) : M.t;
  const bandBottom = op?.min !== undefined ? y(op.min) : y(d0);
  const yTicks = niceTicks(d0, d1, 4);
  const xTicks = timeTicks(t0, t1);
  const shown = active ?? trend.length - 1;
  const point = { t: trendT[shown]!, value: trend[shown]! };
  const breach = rangeBreach(def, point.value);
  const readout = `${missionTimeLabel(point.t)}: ${formatValue(point.value, def.unit)}${breach ? `, ${breachText(def, breach)}` : ''}`;

  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    setActive(nearestIndex(trendT, t0 + ((px - M.l) / (W - M.l - M.r)) * (t1 - t0)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = trend.length - 1;
    const step = e.shiftKey ? 4 : 1;
    const next =
      e.key === 'ArrowLeft' ? Math.max(0, shown - step) : e.key === 'ArrowRight' ? Math.min(last, shown + step) : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
  };

  return (
    <div className="vchart" data-variable={def.id}>
      <div className="vchart__bar">
        <span className="eyebrow">{def.label}, last 48 hours</span>
        <button
          type="button"
          className="button button--small"
          aria-pressed={mode === 'table'}
          aria-controls={tableId}
          onClick={() => setMode(mode === 'chart' ? 'table' : 'chart')}
        >
          Table view
        </button>
      </div>
      <div id={tableId}>
        {mode === 'chart' ? (
          <div
            className="vchart__plot"
            tabIndex={0}
            role="group"
            aria-label={`${def.label} over the last 48 hours. Use the left and right arrow keys to read values; the table view lists them.`}
            onPointerMove={onPointer}
            onPointerLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
            onKeyDown={onKey}
          >
            <svg viewBox={`0 0 ${W} ${H}`} className="vchart__svg" aria-hidden="true" focusable="false">
              {op ? <rect className="vchart__band" x={M.l} width={W - M.l - M.r} y={bandTop} height={Math.max(0, bandBottom - bandTop)} style={tierStyle('none')} /> : null}
              {yTicks.map((tick) => (
                <g key={tick}>
                  <line className="vchart__grid" x1={M.l} x2={W - M.r} y1={y(tick)} y2={y(tick)} />
                  <text className="vchart__tick" x={M.l - 8} y={y(tick)} textAnchor="end" dominantBaseline="central">
                    {formatValue(tick, '', 2).trim()}
                  </text>
                </g>
              ))}
              {xTicks.map((t) => (
                <text key={t} className="vchart__tick" x={x(t)} y={H - 8} textAnchor="middle">
                  {tickLabel(t)}
                </text>
              ))}
              {[op?.max, op?.min].map((limit, i) =>
                limit === undefined ? null : (
                  <g key={i} style={tierStyle('caution')}>
                    <line className="vchart__limit" x1={M.l} x2={W - M.r} y1={y(limit)} y2={y(limit)} />
                    <text className="vchart__label" x={W - M.r - 4} y={y(limit) + (i === 0 ? 14 : -6)} textAnchor="end">
                      NASA limit {formatValue(limit, def.unit)}
                    </text>
                  </g>
                ),
              )}
              <path className="vchart__area" d={area} />
              <path className="vchart__line" d={line} />
              <line className="vchart__cross" x1={x(point.t)} x2={x(point.t)} y1={M.t} y2={H - M.b} data-active={active !== null} />
              <circle className="vchart__dot" cx={x(point.t)} cy={y(point.value)} r={4} />
            </svg>
            {active !== null ? (
              <div className="vchart__tip" style={{ left: `${(x(point.t) / W) * 100}%` }} role="presentation">
                <strong>{formatValue(point.value, def.unit)}</strong>
                <span>{missionTimeLabel(point.t)}</span>
                {breach ? <span>{breachText(def, breach)}</span> : null}
              </div>
            ) : null}
            <p className="sr-only" aria-live="polite">
              {active !== null ? readout : ''}
            </p>
          </div>
        ) : (
          <div className="table-wrap vchart__table">
            <table className="table" aria-label={`${def.label}, hourly values over the last 48 hours`}>
              <thead>
                <tr>
                  <th scope="col">Mission time</th>
                  <th scope="col">{def.label}</th>
                </tr>
              </thead>
              <tbody>
                {hourlyRows(trend, trendT).map((r) => (
                  <tr key={r.t}>
                    <td>{missionTimeLabel(r.t)}</td>
                    <td>{formatValue(r.value, def.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
