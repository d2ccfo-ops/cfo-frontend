import FinancialChart from "@/components/charts/FinancialChart";

const TAG = {
  high: { label: "High confidence", tone: "positive" },
  medium: { label: "Medium confidence", tone: "warning" },
  // A forecast with no outflow source is not a low-confidence balance — it is
  // not a balance at all, and the badge has to say something a reader cannot
  // mistake for "roughly right".
  none: { label: "Inflows only — not a balance", tone: "negative" },
};

export default function CashForecastCard({
  label = "30-day forecast",
  // "No data", not a default figure. This used to default to "₹1.68 Cr
  // projected" — a caller that forgot to pass a value, or passed undefined
  // because its fetch failed, rendered a confident forecast nobody computed.
  // A default value on a money prop is a fabricated number waiting for a bug.
  value = "No data",
  confidence = "none",
  note = "",
  chartTitle = "Projected balance",
  series,
}) {
  const tag = TAG[confidence] || TAG.high;
  const tagClass =
    tag.tone === "positive"
      ? "bg-success-soft text-success"
      : tag.tone === "negative"
        ? "bg-destructive-soft text-destructive"
        : "bg-accent-soft text-accent";
  return (
    <div className="gcard p-5">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
          <div className="text-2xl font-medium text-foreground">{value}</div>
        </div>
        <span className={`flex-none rounded-full px-2.5 py-1 text-xs font-medium ${tagClass}`}>{tag.label}</span>
      </div>
      <FinancialChart title={chartTitle} kind="area" series={series || [{ name: "Projected balance", colorRole: "accent", points: [] }]} yFormat="currency" showLegend={false} height={160} />
      <p className="mb-0 mt-2 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
