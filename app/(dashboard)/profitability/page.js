"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import Metric from "@/components/ui/Metric";
import MetricSkeleton from "@/components/ui/MetricSkeleton";
import NoDataPanel from "@/components/ui/NoDataPanel";
import ProfitabilityTable from "@/components/tables/ProfitabilityTable";
import DataStatusBadge from "@/components/ui/DataStatusBadge";
import { useDateRange } from "@/components/controls/DateRangeContext";
import EvidenceDrawer from "@/components/ui/EvidenceDrawer";
import { fetchEvidence, evidenceToRows, downloadEvidenceCsv } from "@/lib/evidence";
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
    // Net of returns (§13) — a product returned as often as it sells must not
    // read as a bestseller.
    units: p.units,
    revenue: rupeesShort(p.netRevenue),
    cogs: p.cogs === null ? "—" : rupeesShort(p.cogs),
    contribution: p.cm0 === null ? "—" : rupeesShort(p.cm0),
    marginPct: p.cm0Pct ?? 0,
    // null when the SKU had no gross revenue in the period — that is "no
    // basis", not 0%.
    refundRatePct: p.refundRatePct,
  };
}

export default function ProfitabilityPage() {
  const { getToken } = useAuth();
  const { query: dateQuery, key: dateKey, preset: datePreset, ready: dateReady } = useDateRange();

  const [contribution, setContribution] = useState(null);
  const [products, setProducts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [serverEvidence, setServerEvidence] = useState(null);

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

  // §21 evidence, fetched when the drawer first opens. Keyed by the period it
  // was fetched for rather than reset in a separate effect: a period change
  // makes serverEvidence.dateKey stale, which reads as "not yet fetched for
  // this window" without a second setState-in-effect.
  useEffect(() => {
    if (!evidenceOpen || serverEvidence?.dateKey === dateKey) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const env = await fetchEvidence(token, "contribution_margin", dateQuery);
        if (!cancelled) setServerEvidence({ dateKey, envelope: env });
      } catch {
        /* drawer shows what it has */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [evidenceOpen, serverEvidence, getToken, dateQuery, dateKey]);

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
        actions={
          <button className="btn btn-secondary" type="button" onClick={() => setEvidenceOpen(true)}>
            View evidence
          </button>
        }
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
                  covered — an unreliable 87% is far more damaging than a blank.
                  But when CM3 is blocked and CM0 is reliable, the card shows
                  gross margin plainly named as such: hiding a measured CM0
                  behind "Not measurable" claimed margins were unknowable while
                  the largest cost layer was already on file. */}
              <Metric
                label={cm3?.reliable ? "Contribution margin (CM3)" : cm0?.reliable ? "Gross margin (CM0)" : "Contribution margin (CM3)"}
                badge={<DataStatusBadge dataStatus={contribution?.dataStatus} />}
                value={cm3?.reliable ? `${cm3.marginPct}%` : cm0?.reliable ? `${cm0.marginPct}%` : "Not measurable"}
                change={contribution ? `${contribution.dataCompleteness}% of inputs` : "No data"}
                tone={cm3?.reliable ? "positive" : "warning"}
                sub={
                  cm3?.reliable
                    ? "After COGS, fulfilment, fees and ads"
                    : cm0?.reliable
                      ? `After COGS only — full CM blocked: ${marginBlockedReason.toLowerCase()}`
                      : marginBlockedReason
                }
              />
              <Metric
                label={cm3?.reliable ? "Contribution profit" : cm0?.reliable ? "Gross profit (CM0)" : "Contribution profit"}
                badge={<DataStatusBadge dataStatus={contribution?.dataStatus} />}
                value={cm3?.reliable ? rupeesShort(cm3.value) : cm0?.reliable ? rupeesShort(cm0.value) : "Not measurable"}
                change={contribution?.status ?? "No data"}
                tone={cm3?.reliable ? "positive" : "warning"}
                sub={
                  cm3?.reliable
                    ? "Net revenue less every costed layer"
                    : cm0?.reliable
                      ? "Net revenue less product cost — shipping, fees and ads still to come off"
                      : marginBlockedReason
                }
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

        {/* §36's layered ladder, rendered at last — the backend has computed
            CM0→CM3 with a per-layer breakdown all along, and this page showed
            none of it. Reliable levels get their %; unreliable ones show the
            value with an explicit caveat instead of a percentage, because the
            missing layers only subtract — the true number is LOWER. */}
        {!loading && contribution?.levels ? (
          <div className="gcard p-5">
            <div className="mb-1 flex items-center gap-2 text-base font-medium text-foreground">
              The margin ladder
              <DataStatusBadge dataStatus={contribution?.dataStatus} />
            </div>
            <p className="mb-3 text-[12.5px] text-muted-foreground">
              Net revenue {rupeesShort(contribution.netRevenue.value)} minus each cost layer in §36 order.
              A level marked incomplete is an overstatement — its missing layers only subtract.
            </p>
            <div className="flex flex-col">
              {["cm0", "cm1", "cm2", "cm3"].map((k) => {
                const lvl = contribution.levels[k];
                if (!lvl) return null;
                return (
                  <div
                    key={k}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <span className="text-[13.5px] font-medium text-foreground">{lvl.label}</span>
                      <span className="ml-2 text-[12px] text-muted-foreground">{lvl.includes}</span>
                    </div>
                    <div className="text-[13.5px]">
                      <span className="font-medium text-foreground">{rupeesShort(lvl.value)}</span>
                      {lvl.reliable ? (
                        <span className="ml-2" style={{ color: "var(--color-primary)" }}>{lvl.marginPct}%</span>
                      ) : (
                        <span className="ml-2 text-[12px]" style={{ color: "var(--color-accent)" }}>
                          incomplete — true figure is lower
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Every layer, including the ones with no source yet — a founder
                deciding whether to trust CM3 needs to see exactly which costs
                are real and which are still zeros. */}
            <div className="mt-4 mb-2 text-[13px] font-medium text-foreground">Cost layers behind it</div>
            <div className="flex flex-col">
              {(contribution.layers ?? []).map((l) => (
                <div key={l.key} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2 last:border-0">
                  <div className="min-w-0">
                    <span className="text-[13px] text-foreground">{l.label}</span>
                    <span className="ml-2 text-[11.5px] text-muted-foreground">{l.spec}</span>
                    {/* A memo is measured but NOT subtracted — its rupees are
                        already inside the layers above it. Without this label a
                        reader adds it to the deductions and cannot make the
                        column reconcile, which reads as a bug in the page. */}
                    {l.memo ? (
                      <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">
                        not deducted
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[13px]">
                    {l.hasSource ? (
                      <span className={l.memo ? "text-muted-foreground" : "text-foreground"}>{rupeesShort(l.amount)}</span>
                    ) : l.memo ? (
                      <span className="text-muted-foreground">not measurable</span>
                    ) : (
                      <span style={{ color: "var(--color-accent)" }}>no data source — treated as ₹0</span>
                    )}
                    {l.note ? <span className="ml-2 text-[11.5px] text-muted-foreground">{l.note}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

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
            badge={<DataStatusBadge dataStatus={products?.dataStatus} />}
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
            badge={<DataStatusBadge dataStatus={products?.dataStatus} />}
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
            badge={<DataStatusBadge dataStatus={products?.dataStatus} />}
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

      <EvidenceDrawer
        open={evidenceOpen}
        title="Contribution margin"
        sourceLabel="§21 evidence — the backend's own account of this figure"
        rows={
          serverEvidence?.dateKey === dateKey
            ? evidenceToRows(serverEvidence.envelope)
            : [{ label: "Loading", value: "Fetching evidence…" }]
        }
        onClose={() => setEvidenceOpen(false)}
        onDownload={async () => {
          const token = await getToken();
          await downloadEvidenceCsv(token, "contribution_margin", dateQuery);
        }}
      />
    </>
  );
}
