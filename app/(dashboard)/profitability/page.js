"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import Metric from "@/components/ui/Metric";
import MetricSkeleton from "@/components/ui/MetricSkeleton";
import NoDataPanel from "@/components/ui/NoDataPanel";
import ProfitabilityTable from "@/components/tables/ProfitabilityTable";
import { useDateRange } from "@/components/controls/DateRangeContext";
import { formatInrShort as rupeesShort } from "@/lib/money";

// Every figure on this page comes from cfo-backend's /metrics/contribution-margin
// and /metrics/product-profitability. Nothing is invented — the page used to
// ship 12 fabricated SKU rows ("Vitamin C Serum 30ml", "₹14.2 L") and a 6-point
// margin trend, none of which had ever touched the database.
//
// The rule this page has to respect harder than most: a margin computed with
// cost layers missing OVERSTATES profit. The backend already knows whether each
// CM level is reliable, so the cards render a percentage only when it says so,
// and say what is missing when it doesn't.

// The backend sends per-SKU rupees; the table wants display strings. An uncosted
// SKU gets "—" for COGS and contribution rather than a zero, because zero cost
// is a specific and wrong claim.
function toTableRow(p) {
  return {
    name: p.productName,
    revenue: rupeesShort(p.netRevenue),
    cogs: p.cogs === null ? "—" : rupeesShort(p.cogs),
    contribution: p.cm0 === null ? "—" : rupeesShort(p.cm0),
    marginPct: p.cm0Pct ?? 0,
  };
}

export default function ProfitabilityPage() {
  const { getToken } = useAuth();
  const { query: dateQuery, key: dateKey, preset: datePreset, ready: dateReady } = useDateRange();

  const [contribution, setContribution] = useState(null);
  const [products, setProducts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!dateReady) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setFailed(false);
      try {
        const token = await getToken();
        const authed = { headers: { Authorization: `Bearer ${token}` } };
        const api = process.env.NEXT_PUBLIC_API_URL;
        const [cRes, pRes] = await Promise.all([
          fetch(`${api}/metrics/contribution-margin${dateQuery}`, authed),
          fetch(`${api}/metrics/product-profitability${dateQuery}`, authed),
        ]);
        if (cancelled) return;
        if (!cRes.ok && !pRes.ok) {
          setFailed(true);
          return;
        }
        setContribution(cRes.ok ? await cRes.json() : null);
        setProducts(pRes.ok ? await pRes.json() : null);
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

  const cm3 = contribution?.levels?.cm3;
  const cm0 = contribution?.levels?.cm0;
  const coverage = contribution?.cogsCoverage;
  const canRankByMargin = products?.canRankByMargin === true;
  const lossMakers = products?.bottomByMargin ?? [];

  // The reason a margin can't be shown, said once and reused, so the two cards
  // that depend on it can never give different explanations.
  const marginBlockedReason =
    coverage && coverage.totalLines > 0
      ? `Product cost is missing for ${(100 - coverage.valueCoveragePct).toFixed(0)}% of order-line value`
      : "No costed order lines in this period";

  return (
    <>
      <TopNav
        title="Product profitability"
        subtitle={`Contribution margin by product · ${datePreset.toLowerCase()}`}
      />

      <div className="flex flex-col gap-6">
        {failed ? (
          <div
            className="rounded-lg border px-4 py-3 text-[13px]"
            style={{
              borderColor: "var(--color-destructive)",
              background: "var(--color-destructive-soft)",
              color: "var(--color-destructive)",
            }}
            role="alert"
          >
            <strong className="font-medium">Couldn&apos;t reach cfo-backend.</strong> Nothing below is live.
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            <>
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
            </>
          ) : (
            <>
              {/* CM3 is what a founder means by "contribution margin". Shown as a
                  percentage ONLY when the backend says every layer beneath it is
                  covered — an unreliable 87% is far more damaging than a blank. */}
              <Metric
                label="Contribution margin (CM3)"
                value={cm3?.reliable ? `${cm3.marginPct}%` : "Not measurable"}
                change={contribution ? `${contribution.dataCompleteness}% of inputs` : "No data"}
                tone={cm3?.reliable ? "positive" : "warning"}
                sub={cm3?.reliable ? "After COGS, fulfilment, fees and ads" : marginBlockedReason}
              />
              <Metric
                label="Contribution profit"
                value={cm3?.reliable ? rupeesShort(cm3.value) : "Not measurable"}
                change={contribution?.status ?? "No data"}
                tone={cm3?.reliable ? "positive" : "warning"}
                sub={cm3?.reliable ? "Net revenue less every costed layer" : marginBlockedReason}
              />
              {/* Always honest and always available: this is a measurement of how
                  much we can measure. */}
              <Metric
                label="Product cost coverage"
                value={coverage ? `${coverage.valueCoveragePct}%` : "No data"}
                change={coverage ? `${coverage.costedLines.toLocaleString("en-IN")} of ${coverage.totalLines.toLocaleString("en-IN")} lines` : "Connect a sales channel"}
                tone={coverage && coverage.valueCoveragePct >= 95 ? "positive" : "warning"}
                sub="Share of order-line value with a landed cost on file"
              />
              <Metric
                label="Loss-making SKUs"
                value={canRankByMargin ? lossMakers.length.toLocaleString("en-IN") : "Not measurable"}
                change={
                  canRankByMargin
                    ? `${products.costedSkuCount} of ${products.skuCount} SKUs costed`
                    : "Needs product costs"
                }
                tone={canRankByMargin && lossMakers.length > 0 ? "negative" : "neutral"}
                sub={canRankByMargin ? "Selling below product cost (CM0 negative)" : marginBlockedReason}
              />
            </>
          )}
        </div>

        {/* The margin trend chart used to plot six invented months. A real trend
            needs a stored daily/monthly series, and MetricSnapshot is only
            written for the default period today — so this says so instead of
            drawing a line through numbers nobody measured. */}
        <NoDataPanel
          term="chart-margin-trend"
          title="Contribution margin trend"
          reason="No historical margin series is stored yet — margins are computed on demand for the selected period, so there is nothing to plot over time. This turns on once daily metric snapshots are being written."
        />

        {loading ? (
          <ProfitabilityTable title="Top products by revenue" loading />
        ) : (
          <ProfitabilityTable
            title="Top products by revenue"
            subtitle="Revenue is measured per line and needs no cost data — COGS and contribution show “—” for SKUs with no landed cost on file"
            rows={(products?.topByRevenue ?? []).map(toTableRow)}
            emptyMessage="No orders in this period."
          />
        )}

        {loading ? (
          <ProfitabilityTable title="Most profitable products" loading />
        ) : canRankByMargin ? (
          <ProfitabilityTable
            title="Most profitable products"
            subtitle={`Ranked by CM0 (net revenue − product cost). Only the ${products.costedSkuCount} fully-costed SKU${products.costedSkuCount === 1 ? "" : "s"} can be ranked; ${products.stopsAtNote}`}
            rows={(products?.topByMargin ?? []).map(toTableRow)}
            emptyMessage="No costed SKUs sold in this period."
          />
        ) : (
          <NoDataPanel
            title="Most profitable products"
            reason="Ranking products by margin needs a landed cost for every line they sold. None of the SKUs sold in this period are fully costed, so any ranking here would be ordering products by a cost of zero."
            action="Enter product costs"
            href="/costs"
          />
        )}

        {loading ? null : canRankByMargin && lossMakers.length > 0 ? (
          <ProfitabilityTable
            title="Loss-making products"
            subtitle="Selling below product cost — before shipping, fees and ads, which would only make these worse"
            rows={lossMakers.map(toTableRow)}
          />
        ) : null}

        {/* The backend's own caveats, surfaced rather than hidden. These are the
            difference between a number and a number you can act on. */}
        {!loading && (contribution?.warnings?.length || products?.warnings?.length) ? (
          <div className="gcard p-5">
            <div className="mb-2.5 text-base font-medium text-foreground">What limits these numbers</div>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-[13px] leading-relaxed text-muted-foreground">
              {[...(contribution?.warnings ?? []), ...(products?.warnings ?? [])].map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <NoDataPanel
          title="Profitability by channel"
          reason="Channel-level margin needs shipping, fees and ad spend allocated per channel (§41) — those inputs don't exist yet. Revenue by channel is real and lives on the Revenue page."
          action="See revenue by channel"
          href="/revenue"
        />
      </div>
    </>
  );
}
