"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import AlertCard from "@/components/ui/AlertCard";
import NoDataPanel from "@/components/ui/NoDataPanel";
import { useDateRange } from "@/components/controls/DateRangeContext";
import { deriveAnomalies, deriveActions, formatInrShort } from "@/lib/insights";

// This page was entirely fabricated: a hardcoded "Monday, 3 August 2026 ·
// Synced 12 min ago", a summary paragraph asserting ₹1.84 Cr of cash and a
// 34.2% margin, four invented quick metrics, four invented overnight changes,
// and alerts about a Myntra settlement on a store that doesn't sell on Myntra.
//
// Rebuilt on the same live payloads the rest of the dashboard uses. The alerts
// and recommendations come from lib/insights.js, so this page, the Overview and
// the Exceptions page all say the same thing about the same business.

function QuickMetric({ label, value, note, tone = "neutral", loading }) {
  if (loading) {
    return (
      <div className="gcard p-[15px]" role="status" aria-busy="true">
        <span className="sr-only">Loading</span>
        <div className="h-2.5 w-20 animate-pulse rounded-sm bg-primary/10" />
        <div className="mt-1.5 h-5 w-24 animate-pulse rounded-sm bg-primary/10" />
        <div className="mt-1.5 h-3 w-16 animate-pulse rounded-sm bg-primary/10" />
      </div>
    );
  }
  const color =
    tone === "positive" ? "var(--color-success)" : tone === "negative" ? "var(--color-destructive)" : "var(--color-muted-foreground)";
  return (
    <div className="gcard p-[15px]">
      <div className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[19px] font-medium text-foreground">{value}</div>
      <div className="text-[12.5px] font-medium" style={{ color }}>{note}</div>
    </div>
  );
}

export default function DailyBriefPage() {
  const { getToken } = useAuth();
  const { query: dateQuery, key: dateKey, preset: datePreset, ready: dateReady } = useDateRange();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Formatted when the data lands, not during render — `new Date()` in a render
  // body is impure, and this replaces a date that was hardcoded to 3 August.
  const [today, setToday] = useState("");

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
        const [salesRes, revenueRes, rtoRes, cashRes, ladderRes, contributionRes, freshnessRes, productsRes, burnRes, reconRes] =
          await Promise.all([
            fetch(`${api}/metrics/sales${dateQuery}`, authed),
            fetch(`${api}/metrics/revenue${dateQuery}`, authed),
            fetch(`${api}/metrics/rto-rate${dateQuery}`, authed),
            fetch(`${api}/metrics/available-cash${dateQuery}`, authed),
            fetch(`${api}/metrics/revenue-ladder${dateQuery}`, authed),
            fetch(`${api}/metrics/contribution-margin${dateQuery}`, authed),
            fetch(`${api}/metrics/freshness`, authed),
            fetch(`${api}/metrics/product-profitability${dateQuery}`, authed),
            fetch(`${api}/metrics/burn-runway`, authed),
            // The COD position + money exceptions belong in a CFO brief.
            fetch(`${api}/reconciliation/summary${dateQuery}`, authed),
          ]);
        if (cancelled) return;
        const all = [salesRes, revenueRes, rtoRes, cashRes, ladderRes, contributionRes, freshnessRes, productsRes, burnRes, reconRes];
        if (!all.some((r) => r.ok)) {
          setFailed(true);
          return;
        }
        setData({
          sales: salesRes.ok ? await salesRes.json() : null,
          revenue: revenueRes.ok ? await revenueRes.json() : null,
          rto: rtoRes.ok ? await rtoRes.json() : null,
          cash: cashRes.ok ? await cashRes.json() : null,
          ladder: ladderRes.ok ? await ladderRes.json() : null,
          contribution: contributionRes.ok ? await contributionRes.json() : null,
          freshness: freshnessRes.ok ? await freshnessRes.json() : null,
          products: productsRes.ok ? await productsRes.json() : null,
          burn: burnRes.ok ? await burnRes.json() : null,
          recon: reconRes.ok ? await reconRes.json() : null,
        });
        setToday(
          new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
        );
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

  const alerts = data ? deriveAnomalies(data) : [];
  const actions = data ? deriveActions(data) : [];

  const sales = data?.sales;
  const hasOrders = sales && sales.orders.value > 0;
  const cash = data?.cash;
  const hasCash = cash && cash.connections.length > 0;
  const rto = data?.rto;

  const pct = (v) => (v == null ? "No prior data" : `${v >= 0 ? "+" : ""}${v}%`);

  return (
    <>
      <TopNav
        title="Daily CFO brief"
        subtitle={today ? `${today} · ${datePreset.toLowerCase()}` : datePreset}
      />

      <div className="flex flex-col gap-6" style={{ maxWidth: 900 }}>
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
            <strong className="font-medium">Couldn&apos;t reach cfo-backend.</strong> There is no brief to give —
            this is a connection failure, not a quiet day.
          </div>
        ) : null}

        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <QuickMetric
            loading={loading}
            label="Orders"
            value={hasOrders ? sales.orders.value.toLocaleString("en-IN") : "No data"}
            note={hasOrders ? pct(sales.orders.changePct) : "Connect a sales channel"}
            tone={hasOrders && (sales.orders.changePct ?? 0) >= 0 ? "positive" : "negative"}
          />
          <QuickMetric
            loading={loading}
            label="Net revenue"
            value={data?.revenue ? formatInrShort(data.revenue.value) : "No data"}
            note={data?.revenue ? pct(data.revenue.changePct) : "Connect a sales channel"}
            tone={data?.revenue && (data.revenue.changePct ?? 0) >= 0 ? "positive" : "negative"}
          />
          <QuickMetric
            loading={loading}
            label="RTO rate"
            value={rto?.rtoRatePct != null ? `${rto.rtoRatePct}%` : "No data"}
            note={rto?.rtoRatePct != null ? `${rto.rtoCount} of ${rto.dispatchedCount} dispatched` : "Connect a courier"}
            tone={rto?.rtoRatePct != null && rto.rtoRatePct > 10 ? "negative" : "neutral"}
          />
          <QuickMetric
            loading={loading}
            label="Available cash"
            value={hasCash ? formatInrShort(cash.value) : "No data"}
            note={hasCash ? "Bank accounts only" : "Connect a bank account"}
            tone="neutral"
          />
          {/* Profitability was entirely absent from the brief's headline tiles —
              orders, revenue, RTO, cash, and not one word on margin. CM0 is the
              first reliable rung of the ladder; the caveat says which rung. */}
          <QuickMetric
            loading={loading}
            label="Gross margin (CM0)"
            value={
              data?.contribution?.levels?.cm0?.reliable
                ? `${data.contribution.levels.cm0.marginPct}%`
                : "No data"
            }
            note={
              data?.contribution?.levels?.cm0?.reliable
                ? `${formatInrShort(data.contribution.levels.cm0.value)} after COGS only`
                : "Needs product costs"
            }
            tone={data?.contribution?.levels?.cm0?.reliable ? "positive" : "neutral"}
          />
          {(data?.recon?.codPosition ?? data?.recon?.cod)?.hasCourierData ? (
            <QuickMetric
              loading={loading}
              label="COD gone dark"
              value={formatInrShort(Number(((data.recon.codPosition ?? data.recon.cod).unknownValue).slice(0, -2) || "0"))}
              note={`${(data.recon.codPosition ?? data.recon.cod).unknownCount.toLocaleString("en-IN")} parcels silent 30+ days — all-time`}
              tone={(data.recon.codPosition ?? data.recon.cod).unknownCount > 0 ? "negative" : "positive"}
            />
          ) : null}
        </div>

        {/* "What changed overnight" needs yesterday's numbers to compare against
            today's, and no daily metric history is stored yet. The old version
            listed four invented events with timestamps. */}
        <NoDataPanel
          title="What changed overnight"
          reason="An overnight diff needs yesterday's figures stored to compare against today's. Metric snapshots are only written for the current period right now, so there is no previous day on file to difference."
        />

        <div>
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Needs your attention
          </h2>
          <div className="flex flex-col gap-3">
            {loading ? (
              <div className="gcard flex flex-col gap-3 p-5" role="status" aria-busy="true">
                <div className="h-4 w-1/3 animate-pulse rounded-sm bg-primary/10" />
                <div className="h-3 w-4/5 animate-pulse rounded-sm bg-primary/10" />
              </div>
            ) : alerts.length > 0 ? (
              alerts.map((a) => (
                <AlertCard
                  key={a.title}
                  severity={a.severity}
                  title={a.title}
                  description={a.description}
                  meta={a.meta}
                  actionLabel="View details"
                  actionHref={a.href}
                />
              ))
            ) : failed ? null : (
              <NoDataPanel reason="Nothing flagged against the data available for this period." />
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Recommended today
          </h2>
          <div className="flex flex-col gap-3">
            {loading ? (
              <div className="gcard flex flex-col gap-3 p-5" role="status" aria-busy="true">
                <div className="h-4 w-1/3 animate-pulse rounded-sm bg-primary/10" />
                <div className="h-3 w-4/5 animate-pulse rounded-sm bg-primary/10" />
              </div>
            ) : actions.length > 0 ? (
              actions.map((r) => (
                <AlertCard
                  key={r.title}
                  severity="info"
                  title={r.title}
                  description={r.description}
                  meta={r.meta}
                  actionLabel="Open"
                  actionHref={r.href}
                />
              ))
            ) : failed ? null : (
              <NoDataPanel reason="No outstanding setup actions — every source this brief can check is connected and current." />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
