/**
 * A tiny inline trend line (§13T).
 *
 * A Server Component rendering plain SVG: the data is already on the server,
 * so the half-second read this exists for costs the page no JavaScript. It is
 * decoration over numbers that are stated beside it - `aria-hidden`, because a
 * screen reader gets the real figures and would get nothing from a polyline.
 *
 * An all-zero series renders a flat baseline rather than nothing: "no reads
 * this week" is a shape too.
 */
export function Sparkline({
  values,
  width = 96,
  height = 28,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;

  const max = Math.max(...values, 1);
  const pad = 2;
  const step = (width - pad * 2) / (values.length - 1);
  const points = values
    .map((value, index) => {
      const x = pad + index * step;
      const y = pad + (1 - value / max) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = values[values.length - 1];
  const lastX = pad + (values.length - 1) * step;
  const lastY = pad + (1 - last / max) * (height - pad * 2);

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="text-primary"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.75"
      />
      <circle cx={lastX} cy={lastY} r="2.2" fill="currentColor" />
    </svg>
  );
}
