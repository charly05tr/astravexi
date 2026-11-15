/** A tiny trend line with an optional baseline. Decorative: the value it shows is always written next to it. */
export function Sparkline({
  values,
  baseline = null,
  width = 120,
  height = 28,
}: {
  values: readonly number[];
  baseline?: number | null;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <svg className="sparkline sparkline--empty" width={width} height={height} aria-hidden="true" />;
  const all = baseline === null ? values : [...values, baseline];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const pad = 3;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1]!;
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {baseline !== null ? <line className="sparkline__baseline" x1={pad} x2={width - pad} y1={y(baseline)} y2={y(baseline)} /> : null}
      <path className="sparkline__line" d={d} />
      <circle className="sparkline__end" cx={x(values.length - 1)} cy={y(last)} r={2.5} />
    </svg>
  );
}
