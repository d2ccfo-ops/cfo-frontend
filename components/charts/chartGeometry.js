// Shared chart color roles + value formatting.
// colorRole names are referenced by every page's series definitions —
// only the underlying color values changed when the design was ported.

export const CHART_COLORS = {
  accent: "var(--color-chart-1)",
  accent2: "var(--color-chart-2)",
  neutral: "var(--color-muted-foreground)",
};

// EVERY currency series passes RUPEES. This used to assume the value was
// already expressed in lakhs — a carry-over from the design mockups, whose
// series were hardcoded as `y: 24.1` meaning ₹24.1 L. Once the pages started
// feeding real figures the same code turned ₹28,43,646 into "₹28436.46Cr",
// wrong by a factor of 100,000 and confidently labelled. The mock pages were
// converted to rupees rather than this being made unit-aware: one unit for one
// prop is the only version that cannot silently rot again.

// Compact form for AXIS TICKS, where width is genuinely scarce. Always
// abbreviates — the axis exists to convey scale, and the tooltip carries the
// exact figure.
export function formatInrAxis(rupees) {
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? "−" : "";
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

// Drops a trailing ".0" so an axis reads "₹6L" rather than "₹6.0L".
function trim(n) {
  const s = n.toFixed(n < 10 ? 1 : 0);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

// Full precision, Indian digit grouping. Used in tooltips, where there is room
// and where an exact number is the entire reason someone hovered.
export function formatInrExact(rupees) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

export function formatChartValue(v, kind, { exact = false } = {}) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (kind === "percent") return v.toFixed(1) + "%";
  if (kind === "currency") return exact ? formatInrExact(v) : formatInrAxis(v);
  return String(Math.round(v));
}

export function toChartRows(series) {
  const n = series[0] ? series[0].points.length : 0;
  return Array.from({ length: n }, (_, i) => {
    const row = { x: series[0].points[i].x };
    series.forEach((s) => { row[s.name] = s.points[i].y; });
    return row;
  });
}
