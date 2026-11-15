import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from './trend-data';

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: TrendPoint;
}

/** Only MANUAL readings get a mark (a diamond): the line itself is the daily series. */
function ManualDot({ cx, cy, payload }: DotProps) {
  if (cx === undefined || cy === undefined || payload?.source !== 'MANUAL') return <g />;
  const r = 5;
  return (
    <polygon
      className="dot-manual"
      data-source="MANUAL"
      points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
    />
  );
}

/** Value leads (strong), the label follows (secondary); the row is keyed with a short stroke. */
function ChartTooltip({
  point,
  unit,
  precision,
  baseline,
}: {
  point: TrendPoint;
  unit: string;
  precision: 0 | 1;
  baseline: number | null;
}) {
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__title">Day {point.day}</p>
      <div className="chart-tooltip__row">
        <span className="legend-line" aria-hidden="true" />
        <span className="chart-tooltip__value">
          {point.value.toFixed(precision)} {unit}
        </span>
        <span className="chart-tooltip__label">{point.source === 'MANUAL' ? 'Manual' : 'Synthetic'}</span>
      </div>
      {baseline !== null ? (
        <div className="chart-tooltip__row">
          <span className="legend-line legend-line--dashed" aria-hidden="true" />
          <span className="chart-tooltip__value">{baseline.toFixed(precision)}</span>
          <span className="chart-tooltip__label">Baseline</span>
        </div>
      ) : null}
    </div>
  );
}

const TICK = { fill: 'var(--chart-muted)', fontSize: 12 };

export default function TrendChart({
  points,
  baseline,
  label,
  precision,
  unit = '',
}: {
  points: TrendPoint[];
  baseline: number | null;
  label: string;
  precision: 0 | 1;
  unit?: string;
}) {
  return (
    <div className="trend" role="img" aria-label={`${label}, last ${points.length} days`}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 160 }}>
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="day"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickCount={5}
            allowDecimals={false}
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-axis)' }}
            tick={TICK}
            minTickGap={24}
          />
          <YAxis
            width={40}
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => v.toFixed(precision)}
            tickCount={4}
            tickLine={false}
            axisLine={false}
            tick={TICK}
          />
          {baseline !== null ? (
            <ReferenceLine y={baseline} stroke="var(--chart-muted)" strokeDasharray="4 4" ifOverflow="extendDomain" />
          ) : null}
          <Tooltip
            cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const point = active ? (payload?.[0]?.payload as TrendPoint | undefined) : undefined;
              return point ? <ChartTooltip point={point} unit={unit} precision={precision} baseline={baseline} /> : null;
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--chart-series-1)"
            strokeWidth={2}
            dot={ManualDot}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--panel)', fill: 'var(--chart-series-1)' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
