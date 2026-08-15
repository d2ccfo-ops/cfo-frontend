"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import Metric from "@/components/ui/Metric";
import StatusBadge from "@/components/ui/StatusBadge";
import FinancialChart from "@/components/charts/FinancialChart";
import RevenueTrendChart from "@/components/charts/RevenueTrendChart";
import AbbrCurrency from "@/components/ui/AbbrCurrency";
import DataStatusBadge from "@/components/ui/DataStatusBadge";
import MetricCardSkeleton from "@/components/ui/MetricCardSkeleton";
import TableSkeleton from "@/components/ui/TableSkeleton";
import EvidenceDrawer from "@/components/ui/EvidenceDrawer";
import Explain from "@/components/ui/Explain";
import { useDateRange } from "@/components/controls/DateRangeContext";
import { describeComparison } from "@/lib/period";
import { fetchEvidence, evidenceToRows, downloadEvidenceCsv } from "@/lib/evidence";

// Every figure on this page comes from GET /metrics/revenue-ladder, which
// implements §5–§11 of the CFOOS Backend Finance Engine spec. Nothing here is
// computed in the browser beyond formatting — §106: deterministic code
// calculates, the UI (like the LLM) only presents.

function pctLabel(value, suffix = "%") {
  return value == null ? "—" : `${value}${suffix}`;
}

function changeTone(changePct, goodDirection = "up") {
  if (changePct == null) return "neutral";
  const good = goodDirection === "up" ? changePct >= 0 : changePct <= 0;
  return good ? "positive" : "negative";
}

function changeLabel(changePct) {
  return changePct == null ? "No prior data" : `${changePct >= 0 ? "+" : ""}${changePct}%`;
}

// A RATE is judged by how it moved, not by how big it is. Passing a 4.5%
// refund rate to changeTone() marks it "negative" simply for being above zero,
// which paints 0.5% exactly as red as 40% and makes the colour meaningless.
// These compare against the prior period instead, in percentage points — the
// correct unit for the difference between two percentages.
function ratePointChange(current, prior) {
  if (current == null || prior == null) return null;
  return Math.round((current - prior) * 10) / 10;
}

function rateTone(current, prior, goodDirection = "down") {
  const delta = ratePointChange(current, prior);
  if (delta == null || delta === 0) return "neutral";
  const good = goodDirection === "down" ? delta < 0 : delta > 0;
  return good ? "positive" : "negative";
}

function rateChangeLabel(current, prior) {
  const delta = ratePointChange(current, prior);
  if (delta == null) return "No prior period";
  if (delta === 0) return "Unchanged";
  return `${delta > 0 ? "+" : ""}${delta}pp vs prior`;
}

// §90 ranks finality FINAL > RECONCILED > PROVISIONAL > ESTIMATED > INCOMPLETE.
// The badge used to be hardcoded to "warning", so it would stay amber even if
// the number became fully reconciled — a trust indicator that never changes
// tells a reader nothing.
const STATUS_TONE = {
  FINAL: "positive",
  RECONCILED: "positive",
  PROVISIONAL: "warning",
  ESTIMATED: "warning",
  INCOMPLETE: "negative",
};

// §1: each rung is labelled with what it actually is AND the spec section that
// defines it, because "revenue" alone is the ambiguity the whole spec exists to
// eliminate. The `note` is what distinguishes each rung from the one above it.
const LADDER_ROWS = [
  { key: "gmv", label: "GMV", note: "Line-item value, before discounts · ex GST · matches Shopify's gross sales" },
  { key: "grossOrderValue", label: "Gross order value", note: "GMV + shipping charged to customer" },
  { key: "netOrderValue", label: "Net order value", note: "GMV − discounts + shipping · still an order metric" },
  // Sits below the rungs it no longer reduces: as of ladder v3 GST is stripped
  // at GMV, so this is here to show what was collected for the state, not as a
  // step in the walk down to net revenue.
  { key: "outputGst", label: "Output GST", note: "Tax collected on behalf of the state · already excluded from every rung above" },
  { key: "netRevenue", label: "Net revenue", note: "Tax-exclusive, less cancellations and refunds" },
];

export default function RevenuePage() {
  const { getToken } = useAuth();
  const { query: dateQuery, key: dateKey, preset: datePreset, ready: dateReady } = useDateRange();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  // §21 server evidence, fetched when the drawer first opens — the rung
  // definitions below are static, but verification status, sources and the
  // underlying orders only the backend can state.
  const [serverEvidence, setServerEvidence] = useState(null);

  useEffect(() => {
    // Held until the stored date selection has been read back, so a reload
    // doesn't fetch the default period, paint it, then refetch the real one.
    if (!dateReady) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/metrics/revenue-ladder${dateQuery}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.ok) {
          setData(await res.json());
          setFailed(false);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [getToken, dateQuery, dateKey, dateReady]);

  // Keyed by the period it was fetched for rather than reset in a separate
  // effect: a period change makes serverEvidence.dateKey stale, which reads
  // as "not yet fetched for this window" without a second setState-in-effect.
  useEffect(() => {
    if (!evidenceOpen || serverEvidence?.dateKey === dateKey) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const env = await fetchEvidence(token, "revenue", dateQuery);
        if (!cancelled) setServerEvidence({ dateKey, envelope: env });
      } catch {
        /* the static definition rows still render */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [evidenceOpen, serverEvidence, getToken, dateQuery, dateKey]);

  const ladder = data?.ladder;
  // Both windows in words, so the percentages above can be checked.
  const comparison = describeComparison(data?.window);
  const hasOrders = (data?.orders?.total ?? 0) > 0;

  // The cash line is only drawn when a bank is connected. Plotting it without
  // one puts a flat ₹0 next to a rising revenue line, which reads as "none of
  // this was ever collected" — a much stronger and completely false claim than
  // "we cannot see your bank". Months before bank visibility begins arrive as
  // null and render as a gap, not a zero.
  // The trend series itself is built inside RevenueTrendChart: zooming re-cuts
  // the buckets, so whoever owns the window has to own the series too.
  const showCashSeries = data?.cashCoverage?.hasBankConnection === true;

  const channelSeries = data?.byChannel?.length
    ? [{ name: "Net revenue", colorRole: "accent", points: data.byChannel.map((c) => ({ x: c.channel, y: c.netRevenue.value })) }]
    : [];

  return (
    <>
      <TopNav
        title="Revenue analytics"
        subtitle={`Order value through to net revenue · ${datePreset}`}
        actions={
          data ? (
            <>
              {/* §110 dashboard trust layer: finality and completeness are shown
                  next to the numbers, not buried. §90 ranks FINAL > RECONCILED >
                  PROVISIONAL > ESTIMATED > INCOMPLETE. */}
              <StatusBadge
                status={STATUS_TONE[data.status] ?? "warning"}
                label={`${data.status} · ${data.dataCompleteness}% complete`}
              />
              <button className="btn btn-secondary" type="button" onClick={() => setEvidenceOpen(true)}>
                View evidence
              </button>
            </>
          ) : null
        }
      />

      <div className="flex flex-col gap-6">
        {failed ? (
          <div className="gcard p-5 text-sm text-muted-foreground">
            Couldn&apos;t load revenue data. Check that the backend is running and a Shopify connection exists.
          </div>
        ) : null}

        {/* §8: the recognition basis is never left implicit. */}
        {data && !loading ? (
          <div className="gcard p-4 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Recognition basis: {data.recognitionBasis}</span>
            {data.warnings?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div>
          <h2 className="mb-1 flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Revenue ladder
            <DataStatusBadge dataStatus={data?.dataStatus} />
          </h2>
          {/* Every "+12%" below is measured against a window the reader could
              not previously see. Naming both windows is what makes the
              percentage checkable rather than something to take on trust — and
              it is the only place the length mismatch on a month-end (1–28 Feb
              against 1–31 Mar) becomes visible. */}
          {comparison ? (
            <p className="mb-3 text-[12.5px] text-muted-foreground">
              <span className="text-foreground">{comparison.current}</span> compared against{" "}
              <span className="text-foreground">{comparison.prior}</span> — {comparison.label}
              {comparison.uneven ? (
                <span style={{ color: "var(--color-accent)" }}>{comparison.uneven}</span>
              ) : null}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {loading
              ? LADDER_ROWS.map((r) => <MetricCardSkeleton key={r.key} />)
              : LADDER_ROWS.map((row) => {
                  const rung = ladder?.[row.key];
                  return (
                    <Metric
                      key={row.key}
                      label={`${row.label} · ${rung?.spec ?? ""}`}
                      value={rung ? <AbbrCurrency value={rung.value} /> : "—"}
                      change={rung ? changeLabel(rung.changePct) : ""}
                      // Output GST rising isn't good or bad on its own — it's a
                      // pass-through to government, not earnings.
                      tone={row.key === "outputGst" ? "neutral" : changeTone(rung?.changePct)}
                      sub={row.note}
                    />
                  );
                })}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Order quality
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {loading ? (
              <>
                <MetricCardSkeleton />
                <MetricCardSkeleton />
                <MetricCardSkeleton />
                <MetricCardSkeleton />
              </>
            ) : (
              <>
                <Metric
                  label="Orders · §67"
                  value={hasOrders ? data.orders.recognised.toLocaleString("en-IN") : "—"}
                  change={changeLabel(data?.orders?.changePct)}
                  tone={changeTone(data?.orders?.changePct)}
                  sub={`${data?.orders?.cancelled ?? 0} cancelled and excluded`}
                />
                {/* All orders placed, the same denominator Shopify's sales
                    report uses, so this cross-checks against Shopify directly.
                    The §16 recognised-basis figure is named in the sub-label
                    rather than dropped — it runs ~5% higher because cancelled
                    orders leave the denominator. */}
                <Metric
                  label="Ordered AOV · §64"
                  value={data?.aov?.allPlaced != null ? <AbbrCurrency value={data.aov.allPlaced} /> : "—"}
                  change={data?.aov?.allPlacedPrior != null ? `was ₹${data.aov.allPlacedPrior.toLocaleString("en-IN")}` : ""}
                  tone="neutral"
                  sub={
                    data?.aov?.ordered != null
                      ? `All orders placed · ₹${data.aov.ordered.toLocaleString("en-IN")} excluding cancelled (§16)`
                      : "Delivered AOV needs delivery data we don't have"
                  }
                />
                <Metric
                  label="Refund rate · §66"
                  value={pctLabel(data?.refunds?.revenueRefundRatePct)}
                  change={rateChangeLabel(data?.refunds?.revenueRefundRatePct, data?.refunds?.priorRevenueRefundRatePct)}
                  tone={rateTone(data?.refunds?.revenueRefundRatePct, data?.refunds?.priorRevenueRefundRatePct)}
                  sub={
                    // The rupees behind the rate — a rate alone can't say
                    // whether 4% is ₹40 or ₹4 lakh walking back out the door.
                    data?.refunds?.value != null ? (
                      <>
                        <AbbrCurrency value={data.refunds.value} /> refunded · {pctLabel(data?.refunds?.orderRefundRatePct)} of
                        orders · denominator is recognised, not delivered, orders
                      </>
                    ) : (
                      `${pctLabel(data?.refunds?.orderRefundRatePct)} of orders · by value; denominator is recognised, not delivered, orders`
                    )
                  }
                />
                <Metric
                  label="Cancellation rate · §67"
                  value={pctLabel(data?.cancellations?.ratePct)}
                  change={rateChangeLabel(data?.cancellations?.ratePct, data?.cancellations?.priorRatePct)}
                  tone={rateTone(data?.cancellations?.ratePct, data?.cancellations?.priorRatePct)}
                  sub={`${data?.cancellations?.count ?? 0} orders cancelled · ${pctLabel(data?.cancellations?.valueRatePct)} by value`}
                />
                {/* §12 — the backend calls this "a metric founders steer on",
                    and it was rendered only as one bar in the waterfall, where
                    a rate creeping from 4% to 6% is invisible. */}
                <Metric
                  label="Discount rate · §12"
                  value={pctLabel(data?.discounts?.ratePct)}
                  change={rateChangeLabel(data?.discounts?.ratePct, data?.discounts?.priorRatePct)}
                  tone={rateTone(data?.discounts?.ratePct, data?.discounts?.priorRatePct)}
                  sub={
                    data?.discounts?.value != null ? (
                      <>
                        <AbbrCurrency value={data.discounts.value} /> given away · assumed brand-funded (Shopify reports one
                        total)
                      </>
                    ) : (
                      "Share of gross order value given as discounts"
                    )
                  }
                />
              </>
            )}
          </div>
        </div>

        {/* §104 profitability waterfall, revenue portion. Rendered as explicit
            steps rather than a single number so a founder can see where order
            value goes — which is the entire point of the waterfall. */}
        <div className="gcard p-5">
          <div className="mb-1 text-base font-medium text-foreground">How order value becomes net revenue</div>
          <div className="mb-4 text-xs text-muted-foreground">Spec §104 · every step is a real deduction, not an allocation</div>
          {loading ? (
            <div className="flex flex-col gap-2.5 py-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded-sm bg-primary/10" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {(data?.waterfall ?? []).map((step) => {
                const isTotal = step.kind === "total";
                const isStart = step.kind === "start";
                // Bar width is relative to the starting gross order value, so
                // the deductions are visually comparable to what they come out of.
                const base = Math.abs(data?.waterfall?.[0]?.value || 1);
                const width = Math.min(100, (Math.abs(step.value) / base) * 100);
                return (
                  <div key={step.label} className="flex items-center gap-3">
                    <div className="w-28 shrink-0 text-[13px] text-foreground sm:w-44">
                      {/* Every step of the waterfall is a rung of the ladder,
                          and each one explains what it is and what it takes
                          off. Steps with no recorded definition render as
                          plain text. */}
                      <Explain>{step.label}</Explain>
                      <span className="ml-1.5 text-[11px] text-muted-foreground">{step.spec}</span>
                    </div>
                    <div className="h-5 min-w-0 flex-1 overflow-hidden rounded-[3px] bg-muted">
                      <div
                        className={`h-full rounded-[3px] ${
                          isStart || isTotal ? "bg-primary" : "bg-destructive/60"
                        }`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <div
                      className={`w-20 shrink-0 text-right text-[13px] tabular-nums sm:w-32 ${
                        isTotal || isStart ? "font-medium text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      <AbbrCurrency value={step.value} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* §104 cross-check against Shopify's "Sales over time" report, in
              Shopify's own column names. The backend verified these tie to the
              live store to the paisa; rendering them lets the founder run the
              same check without knowing which rung maps to which column. */}
          {data?.shopifyEquivalent ? (
            <div className="mt-4 border-t border-border pt-3">
              <div className="text-[13px] font-medium text-foreground">Cross-check with Shopify</div>
              <div className="mb-2 text-[11px] text-muted-foreground">{data.shopifyEquivalent.note}</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { key: "grossSales", label: "Gross sales" },
                  { key: "netSales", label: "Net sales" },
                  { key: "totalSales", label: "Total sales" },
                ].map((c) => {
                  const cell = data.shopifyEquivalent[c.key];
                  return cell ? (
                    <div key={c.key} className="rounded-md bg-muted/50 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">{c.label}</div>
                      <div className="text-[15px] font-medium tabular-nums text-foreground">
                        <AbbrCurrency value={cell.value} />
                      </div>
                      <div className="text-[11px] text-muted-foreground">= {cell.maps_to}</div>
                    </div>
                  ) : null;
                })}
              </div>
              <div className="mt-1.5 text-[11px] text-muted-foreground">
                {data.shopifyEquivalent.orders?.toLocaleString("en-IN")} orders — matches Shopify&apos;s order count for
                the same dates.
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
          <RevenueTrendChart
            title={showCashSeries ? "Net revenue vs cash received" : "Net revenue"}
            subtitle="Trailing 6 months · not affected by the date filter"
            showCashSeries={showCashSeries}
            initialTrend={data?.trend ?? null}
            initialWindow={data?.trendWindow ?? null}
            loading={loading}
            footnote={
              showCashSeries
                ? `Revenue is recognised when the order is placed (§8); cash is matched bank credit (§44). The gap is settlement lag. ${data?.cashCoverage?.note ?? ""}`
                : (data?.cashCoverage?.note ??
                  "Revenue is recognised when the order is placed (§8).")
            }
          />
          <FinancialChart
            title="Net revenue by channel"
            term="chart-revenue-by-channel"
            subtitle="Selected period"
            kind="bar"
            series={channelSeries}
            yFormat="currency"
            showLegend={false}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="gcard p-5">
            <div className="mb-2.5 text-base font-medium text-foreground">Revenue by channel</div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Channel</th><th>Orders</th><th>GMV</th><th>Net revenue</th><th>Share</th></tr>
                </thead>
                {loading ? (
                  <TableSkeleton rows={3} columns={5} />
                ) : (
                  <tbody>
                    {(data?.byChannel ?? []).map((c) => (
                      <tr key={c.channel}>
                        <td className="capitalize">{c.channel}</td>
                        <td>{c.orders.toLocaleString("en-IN")}</td>
                        <td><AbbrCurrency value={c.gmv.value} /></td>
                        <td><AbbrCurrency value={c.netRevenue.value} /></td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-[3px] bg-muted">
                              <div className="h-full rounded-[3px] bg-primary" style={{ width: `${c.sharePct ?? 0}%` }} />
                            </div>
                            <span className="text-[12.5px]">{pctLabel(c.sharePct)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!loading && (data?.byChannel?.length ?? 0) === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-muted-foreground">
                          No orders in this period.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                )}
              </table>
            </div>
          </div>

          {/* §68. Worth its own panel because COD and prepaid have completely
              different economics — COD carries RTO risk and remittance lag that
              prepaid doesn't. */}
          <div className="gcard p-5">
            <div className="mb-1 text-base font-medium text-foreground">Payment mix</div>
            <div className="mb-4 text-xs text-muted-foreground">
              Spec §68 · by order count and by value · cancelled orders excluded (§16)
            </div>
            {loading ? (
              <div className="flex flex-col gap-3">
                {[0, 1].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-sm bg-primary/10" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {[
                  { label: "COD", countPct: data?.paymentMix?.codPct, valuePct: data?.paymentMix?.codValuePct, count: data?.paymentMix?.codCount, value: data?.paymentMix?.codValue?.value },
                  // prepaidValuePct comes from the backend rather than being
                  // derived as `100 − codValuePct`: that subtraction turns a
                  // null denominator into a confident "100% of value" when
                  // there are no orders at all.
                  { label: "Prepaid", countPct: data?.paymentMix?.prepaidPct, valuePct: data?.paymentMix?.prepaidValuePct, count: data?.paymentMix?.prepaidCount, value: data?.paymentMix?.prepaidValue?.value },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="mb-1 flex items-baseline justify-between text-[13px]">
                      <span className="text-foreground">{m.label}</span>
                      <span className="text-muted-foreground">
                        {pctLabel(m.countPct)} of orders · {pctLabel(m.valuePct)} of value
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-[3px] bg-muted">
                      <div className="h-full rounded-[3px] bg-primary" style={{ width: `${m.countPct ?? 0}%` }} />
                    </div>
                    {/* The rupees, not just the split — "48% of value" and the
                        ₹ it stands for are different facts, and COD's number is
                        the one riding on couriers. */}
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {(m.count ?? 0).toLocaleString("en-IN")} orders
                      {m.value != null ? (
                        <>
                          {" "}· <AbbrCurrency value={m.value} /> net order value
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
                {data?.paymentMix?.unknownCount > 0 ? (
                  <div className="text-[11px] text-muted-foreground">
                    {data.paymentMix.unknownCount} orders have no gateway recorded and are excluded from this mix.
                  </div>
                ) : null}
                <div className="border-t border-border pt-3 text-[13px]">
                  <div className="flex items-baseline justify-between">
                    <span className="text-foreground">Repeat customers · §69</span>
                    <span className="text-muted-foreground">{pctLabel(data?.repeatCustomers?.ratePct)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {data?.repeatCustomers?.repeat ?? 0} of {data?.repeatCustomers?.customers ?? 0} customers ordered more than once in this period
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <EvidenceDrawer
        open={evidenceOpen}
        title="Revenue ladder"
        sourceLabel={`Formula version ${data?.formulaVersion ?? "—"} · ${data?.status ?? "—"} · computed ${data?.lastCalculatedAt ? new Date(data.lastCalculatedAt).toLocaleString() : "—"}`}
        rows={[
          { label: "GMV (§5)", value: "Σ line-item price × quantity, before discounts" },
          { label: "Gross order value (§6)", value: "GMV + shipping charged to customer" },
          { label: "Net order value (§7)", value: "GMV − discounts + shipping" },
          { label: "Output GST (§10)", value: "Tax collected; prices are GST-inclusive, so this is removed to reach a tax-exclusive base" },
          { label: "Net revenue (§11)", value: "Tax-exclusive order value, excluding cancelled orders, less the ex-GST portion of refunds" },
          { label: "Recognition basis (§8)", value: data?.recognitionBasis ?? "—" },
          // The boundaries every percentage on this page is measured against.
          // Spelled out here as well as in the header, because this drawer is
          // where someone goes when they doubt a number.
          {
            label: "Period measured",
            value: comparison
              ? `${comparison.current} (${data?.window?.days ?? "?"} days, ${data?.window?.timeZone ?? "org calendar"})`
              : "—",
          },
          {
            label: "Compared against",
            value: comparison
              ? `${comparison.prior} (${data?.window?.comparedTo?.days ?? "?"} days) — ${comparison.label}${comparison.uneven}`
              : "—",
          },
          { label: "Refunds (§13/§14)", value: "Only successful refund transactions — Shopify voids move no money and are excluded" },
          { label: "Finality (§90)", value: `${data?.status ?? "—"} — nothing here is reconciled to a settlement or bank credit yet` },
          { label: "Completeness (§89)", value: `${data?.dataCompleteness ?? "—"}%` },
          // §21 server evidence: verification status, live sources and the
          // first underlying orders. includeText: false — the rungs above
          // already define the metric.
          ...(serverEvidence?.dateKey === dateKey ? evidenceToRows(serverEvidence.envelope, { includeText: false }) : []),
        ]}
        onClose={() => setEvidenceOpen(false)}
        onDownload={async () => {
          const token = await getToken();
          await downloadEvidenceCsv(token, "revenue", dateQuery);
        }}
      />
    </>
  );
}
