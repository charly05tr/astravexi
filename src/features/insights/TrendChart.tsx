import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from './trend-data';

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: TrendPoint;
}

/** Hollow circle = SYNTHETIC, filled diamond = MANUAL. Distinct by shape and fill, so no hover is needed. */
function SourceDot({ cx, cy, payload }: DotProps) {
  if (cx === undefined || cy === undefined || !payload) return <g />;
  if (payload.source === 'MANUAL') {
    const r = 5;
    return (
      <polygon
        className="dot-manual"
        data-source="MANUAL"
        points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
      />
    );
  }
  return <circle className="dot-synthetic" data-source="SYNTHETIC" cx={cx} cy={cy} r={3.5} />;
}

export default function TrendChart({
  points,
  baseline,
  label,
  precision,
}: {
  points: TrendPoint[];
  baseline: number | null;
  label: string;
  precision: 0 | 1;
}) {
  return (
    <div className="trend" role="img" aria-label={`${label}, last ${points.length} days`}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 110 }}>
        <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.15} />
          <XAxis dataKey="day" type="number" domain={['dataMin', 'dataMax']} tickCount={5} allowDecimals={false} />
          <YAxis
            width={36}
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => v.toFixed(precision)}
            tickCount={4}
          />
          {baseline !== null ? <ReferenceLine y={baseline} className="baseline-line" ifOverflow="extendDomain" /> : null}
          <Line type="monotone" dataKey="value" dot={SourceDot} activeDot={false} isAnimationActive={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
