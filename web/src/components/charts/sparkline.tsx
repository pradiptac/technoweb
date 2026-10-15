import { plot, smoothPath, under } from "./geometry";
import { toneColour, type ChartTone } from "./tones";

/**
 * A trend in the corner of a tile: no axis, no labels, the shape only.
 *
 * Server-rendered, no JavaScript. Scaled to its own peak on purpose — a
 * sparkline answers "rising or falling, steady or spiky", never "how many";
 * the figure beside it is the how-many. A flat line of zeroes is drawn on the
 * baseline rather than hidden, because "nothing for thirty days" is a shape
 * too. The gradient id is derived from the tone and the values, so two tiles
 * on one page never share one by accident and the server and the client
 * agree on it.
 */
export function Sparkline({ values, tone = "brand", className = "h-8 w-full" }: {
  values: number[];
  tone?: ChartTone | string;
  className?: string;
}) {
  if (values.length < 2) return null;
  const top = Math.max(1, ...values) * 1.15;
  const line = smoothPath(plot(values, top));
  const id = `spark-${String(tone).replace(/[^a-z0-9]/gi, "")}-${values.length}-${values.reduce((a, v, i) => (a * 31 + v * (i + 1)) % 1e9, 7)}`;
  const colour = toneColour(tone);

  return (
    <svg aria-hidden data-chart-draw viewBox="0 0 100 100" preserveAspectRatio="none" className={className}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.28" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={under(line)} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={colour} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
