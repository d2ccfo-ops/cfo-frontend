"use client";

import { ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { CHART_COLORS, formatChartValue, toChartRows } from "./chartGeometry";
import Explain from "@/components/ui/Explain";
import { explainAttrs } from "@/components/ui/ExplainMode";

const AXIS_TICK = { fontSize: 12, fill: "var(--color-muted-foreground)" };
// left: 0 rather than -8. The negative inset pulled the Y axis partly outside
// the plot area, which is what clipped "₹30.00Cr" down to ").00Cr".
//
// right: 16 for the same class of bug at the other end. X-axis tick labels are
// centred on their point, so the final one hangs half its width past the last
// data point — at 8px the trailing "Aug" rendered as "Auç", with the tail of
// the glyph cut off by the SVG edge.
const MARGIN = { top: 8, right: 16, left: 0, bottom: 0 };

// How many x labels to draw. `interval={0}` (every tick, always) was fine when
// every chart had six months or eight channels on it; a zoomed-in daily view
// has ninety, and forcing all of them produces a grey smear. Recharts' interval
// is "skip N between each", so this thins to at most ~10 labels.
function tickInterval(pointCount) {
  return Math.max(0, Math.ceil(pointCount / 10) - 1);
}

// Wide enough for the longest tick the compact formatter can produce
// ("−₹99.9Cr"). The old 48px fitted the mockups' one-or-two-digit lakh values
// and nothing else.
const Y_AXIS_WIDTH = 68;

function ChartTooltip({ active, payload, label, yFormat }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-raised">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-col gap-1.5">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4 text-sm text-foreground">
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
              {p.dataKey}
            </span>
            {/* exact: the axis already gave the reader scale — the only reason
                to hover a point is to see the actual number. */}
            <span className="font-semibold tabular-nums">{formatChartValue(p.value, yFormat, { exact: true })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FinancialChart({
  title = "Chart",
  subtitle = "",
  kind = "line",
  series = [],
  height = 240,
  yFormat = "number",
  footnote = "",
  showLegend = true,
  // Optional slots, all inert unless passed — the ten existing call sites are
  // unchanged by their presence.
  //
  // controls: rendered under the legend (the zoom toolbar on the trend chart).
  // plotRef:  attached to the plot wrapper so a gesture hook can bind to it.
  // busy:     a refetch is in flight. The CURRENT line stays drawn and is
  //           dimmed, rather than being replaced by a skeleton — the points on
  //           screen are real and still labelled with the window they belong
  //           to, and blanking a chart on every notch of a pinch makes the
  //           gesture impossible to aim.
  controls = null,
  plotRef = null,
  busy = false,
  // A key into lib/definitions.js. A chart is a calculation drawn as a line —
  // what it plots, over what window, and what it leaves out are all things you
  // have to know before reading a trend off it. Falls back to the title.
  term = null,
}) {
  const data = toChartRows(series);
  const yTickFormatter = (v) => formatChartValue(v, yFormat);
  const xInterval = tickInterval(data.length);

  return (
    <div className="gcard flex flex-col p-5" {...explainAttrs(term ?? title)}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-base font-medium text-foreground">
            <Explain term={term ?? title} underline={false} className="hover:underline hover:decoration-dotted hover:underline-offset-4">
              {title}
            </Explain>
          </div>
          {subtitle ? <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          {showLegend && series.length > 0 ? (
            <div className="flex gap-3.5">
              {series.map((s) => (
                <span key={s.name} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: CHART_COLORS[s.colorRole] || CHART_COLORS.neutral }} />
                  {s.name}
                </span>
              ))}
            </div>
          ) : null}
          {controls}
        </div>
      </div>

      <div
        ref={plotRef}
        className={`mt-2 transition-opacity duration-150 ${busy ? "opacity-50" : "opacity-100"}`}
        // touch-action:none only where a pinch handler is actually bound,
        // otherwise the chart would swallow ordinary page scrolling on touch.
        style={plotRef ? { touchAction: "pan-y" } : undefined}
      >
        <ResponsiveContainer width="100%" height={height}>
          {kind === "bar" ? (
            <BarChart data={data} margin={MARGIN}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="x" axisLine={false} tickLine={false} tick={AXIS_TICK} interval={xInterval} />
              <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} tickCount={4} tickFormatter={yTickFormatter} width={Y_AXIS_WIDTH} />
              <Tooltip content={<ChartTooltip yFormat={yFormat} />} cursor={{ fill: "var(--color-muted)" }} />
              {series.map((s) => (
                <Bar key={s.name} dataKey={s.name} fill={CHART_COLORS[s.colorRole] || CHART_COLORS.neutral} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              ))}
            </BarChart>
          ) : kind === "area" ? (
            <AreaChart data={data} margin={MARGIN}>
              <defs>
                {series.map((s) => {
                  const color = CHART_COLORS[s.colorRole] || CHART_COLORS.neutral;
                  return (
                    <linearGradient key={s.name} id={`fill-${s.name}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="x" axisLine={false} tickLine={false} tick={AXIS_TICK} interval={xInterval} />
              <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} tickCount={4} tickFormatter={yTickFormatter} width={Y_AXIS_WIDTH} />
              <Tooltip content={<ChartTooltip yFormat={yFormat} />} cursor={{ stroke: "var(--color-border)" }} />
              {series.map((s) => {
                const color = CHART_COLORS[s.colorRole] || CHART_COLORS.neutral;
                return <Area key={s.name} type="monotone" dataKey={s.name} stroke={color} strokeWidth={2} fill={`url(#fill-${s.name})`} isAnimationActive={false} />;
              })}
            </AreaChart>
          ) : (
            <LineChart data={data} margin={MARGIN}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="x" axisLine={false} tickLine={false} tick={AXIS_TICK} interval={xInterval} />
              <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} tickCount={4} tickFormatter={yTickFormatter} width={Y_AXIS_WIDTH} />
              <Tooltip content={<ChartTooltip yFormat={yFormat} />} cursor={{ stroke: "var(--color-border)" }} />
              {series.map((s) => {
                const color = CHART_COLORS[s.colorRole] || CHART_COLORS.neutral;
                return <Line key={s.name} type="monotone" dataKey={s.name} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />;
              })}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {footnote ? <div className="mt-1.5 text-[11.5px] text-muted-foreground">{footnote}</div> : null}
    </div>
  );
}
