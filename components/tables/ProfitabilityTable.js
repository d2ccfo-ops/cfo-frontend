"use client";

import TableSkeleton from "@/components/ui/TableSkeleton";
import Explain from "@/components/ui/Explain";

export default function ProfitabilityTable({
  title = "Product profitability",
  subtitle = "",
  nameHeader = "Product",
  rows = [],
  loading = false,
  emptyMessage = "No products in this period.",
  // §28 status pill node — every COGS-derived table carries the same label as
  // the cards computed from the same payload.
  badge = null,
}) {
  return (
    <div className="gcard p-5">
      <div className="flex items-center gap-2 text-base font-medium text-foreground">
        {title}
        {badge}
      </div>
      {subtitle ? <div className="mb-2.5 text-xs text-muted-foreground">{subtitle}</div> : <div className="mb-2.5" />}
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {/* Every column except the name is a derived number, so every one
                  of them says how it was derived. */}
              <th>{nameHeader}</th>
              <th>Units</th>
              <th><Explain term="col-revenue">Revenue</Explain></th>
              <th><Explain term="col-cogs">COGS</Explain></th>
              <th><Explain term="col-contribution">Contribution</Explain></th>
              <th><Explain term="col-margin">Margin</Explain></th>
              <th>Refund %</th>
            </tr>
          </thead>
          {/* Skeleton rows rather than an empty body: an empty table under a
              populated header reads as "you have no products", which is a claim,
              not a loading state. */}
          {loading ? <TableSkeleton rows={5} columns={7} /> : null}
          {loading ? null : <tbody>
            {rows.map((r, i) => {
              const isNeg = r.marginPct < 0;
              const width = (Math.min(Math.abs(r.marginPct), 60) / 60) * 100;
              const marginLabel = (r.marginPct >= 0 ? "" : "−") + Math.abs(r.marginPct).toFixed(0) + "%";
              return (
                <tr key={i}>
                  <td>{r.name}</td>
                  {/* Units are net of returns; undefined means the caller predates
                      the column, which renders as an em dash, not a zero. */}
                  <td>{r.units != null ? r.units.toLocaleString("en-IN") : "—"}</td>
                  <td>{r.revenue}</td>
                  <td>{r.cogs}</td>
                  <td>{r.contribution}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-[3px] bg-muted">
                        <div className="h-full rounded-[3px]" style={{ width: `${width}%`, background: isNeg ? "var(--color-destructive)" : "var(--color-success)" }} />
                      </div>
                      <span className="text-[12.5px] font-medium" style={{ minWidth: 38, color: isNeg ? "var(--color-destructive)" : "var(--color-success)" }}>
                        {marginLabel}
                      </span>
                    </div>
                  </td>
                  {/* null = no gross revenue in the period to compute a rate
                      from; a high rate is flagged because it eats the margin the
                      previous column just claimed. */}
                  <td>
                    {r.refundRatePct == null ? (
                      "—"
                    ) : (
                      <span style={r.refundRatePct >= 5 ? { color: "var(--color-destructive)" } : undefined}>
                        {r.refundRatePct}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-muted-foreground">{emptyMessage}</td>
              </tr>
            ) : null}
          </tbody>}
        </table>
      </div>
    </div>
  );
}
