"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import AlertCard from "@/components/ui/AlertCard";
import BriefNarrativeCard from "@/components/cards/BriefNarrativeCard";
import NoDataPanel from "@/components/ui/NoDataPanel";
import { useDateRange } from "@/components/controls/DateRangeContext";
import DataStatusBadge from "@/components/ui/DataStatusBadge";
import { deriveSystemHealth, deriveActions, formatInrShort } from "@/lib/insights";
import { toAlerts } from "@/lib/anomalies";
import { loadProgressively } from "@/components/lib/progressiveLoad";

// Every payload this page paints, keyed. The set doubles as the "still in
// flight" ledger: a key in `pending` means that card has no answer yet and
// must show a skeleton rather than assert "No data" about a source that is
// merely slow. Measured live, the cheapest of these answers in ~40ms and the
// dearest in ~1,000ms, and the old Promise.all made all eleven wait for that
// second.
const METRIC_KEYS = [
  "sales",
  "revenue",
  "rto",
  "cash",
  "ladder",
  "contribution",
  "freshness",
  "products",
  "burn",
  "recon",
  "anomalies",
];

// The two derived lists read several payloads each (see lib/insights.js), so
// they stay in their loading state until every source they consult has
// answered — otherwise "Nothing flagged" would mean "nothing has arrived yet".
const ALERT_KEYS = ["anomalies", "ladder", "contribution", "freshness", "burn", "recon"];
const ACTION_KEYS = ["contribution", "freshness", "products"];

// This page was entirely fabricated: a hardcoded "Monday, 3 August 2026 ·
// Synced 12 min ago", a summary paragraph asserting ₹1.84 Cr of cash and a
// 34.2% margin, four invented quick metrics, four invented overnight changes,
// and alerts about a Myntra settlement on a store that doesn't sell on Myntra.
//
// Rebuilt on the same live payloads the rest of the dashboard uses. The alerts
// and recommendations come from lib/insights.js, so this page, the Overview and
// the Exceptions page all say the same thing about the same business.

function QuickMetric({ label, value, note, tone = "neutral", loading, badge = null }) {
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
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">{label}</span>
        {badge}
      </div>
      <div className="mt-0.5 text-[19px] font-medium text-foreground">{value}</div>
      <div className="text-[12.5px] font-medium" style={{ color }}>{note}</div>
    </div>
  );
}

export default function DailyBriefPage() {
  const { getToken } = useAuth();
  const { query: dateQuery, key: dateKey, preset: datePreset, ready: dateReady } = useDateRange();

  const [data, setData] = useState({});
  const [pending, setPending] = useState(() => new Set(METRIC_KEYS));
  // P4.5's narrative. Its own state, its own request, its own failure mode:
  // the deterministic brief must render in full whether or not a model wrote
  // anything, so a failure here can never blank the page.
  const [brief, setBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Formatted when the data lands, not during render — `new Date()` in a render
  // body is impure, and this replaces a date that was hardcoded to 3 August.
  const [today, setToday] = useState("");

  useEffect(() => {
    if (!dateReady) return;
    let cancelled = false;
    async function load() {
      // Back to skeletons, not to the previous period's figures: a card still
      // showing last month's revenue under a new date range is a lie with a
      // number in it.
      setData({});
      setPending(new Set(METRIC_KEYS));
      setFailed(false);
      try {
        const token = await getToken();
        const authed = { headers: { Authorization: `Bearer ${token}` } };
        const api = process.env.NEXT_PUBLIC_API_URL;
        const store = (key) => (payload) => setData((d) => ({ ...d, [key]: payload }));
        // Whether anything at all answered. Only the metrics count towards it:
        // the narrative is commentary, so a brief arriving while every figure
        // failed is still an unreachable backend.
        let anyMetric = false;
        // Counted so the failure verdict can be reached the moment the LAST
        // METRIC settles. The promise below also covers /ai/daily-brief, which
        // no tile or derived list reads, so waiting on it left a window where
        // metrics that failed fast had already painted "No data" / "Connect a
        // sales channel" with no error banner above them.
        let metricsSettled = 0;
        await loadProgressively(
          [
            { key: "sales", url: `${api}/metrics/sales${dateQuery}`, apply: store("sales") },
            { key: "revenue", url: `${api}/metrics/revenue${dateQuery}`, apply: store("revenue") },
            { key: "rto", url: `${api}/metrics/rto-rate${dateQuery}`, apply: store("rto") },
            { key: "cash", url: `${api}/metrics/available-cash${dateQuery}`, apply: store("cash") },
            { key: "ladder", url: `${api}/metrics/revenue-ladder${dateQuery}`, apply: store("ladder") },
            { key: "contribution", url: `${api}/metrics/contribution-margin${dateQuery}`, apply: store("contribution") },
            { key: "freshness", url: `${api}/metrics/freshness`, apply: store("freshness") },
            { key: "products", url: `${api}/metrics/product-profitability${dateQuery}`, apply: store("products") },
            { key: "burn", url: `${api}/metrics/burn-runway`, apply: store("burn") },
            // The COD position + money exceptions belong in a CFO brief.
            { key: "recon", url: `${api}/reconciliation/summary${dateQuery}`, apply: store("recon") },
            // §17 anomalies. Not date-filtered — the engine runs on its own
            // trailing-28-day window, so scoping to the picker would hide
            // findings whose window doesn't line up with it.
            { key: "anomalies", url: `${api}/anomalies`, apply: store("anomalies") },
            // Read, never generated: GET /ai/daily-brief returns what the
            // nightly sweep wrote. A page load that could trigger a model call
            // would make the first person in each morning wait for one. It
            // used to be requested only after all eleven metrics had resolved,
            // which made the sentence a founder reads first the last thing on
            // the page to arrive.
            { key: "brief", url: `${api}/ai/daily-brief`, apply: setBrief },
          ],
          {
            init: authed,
            isCancelled: () => cancelled,
            onSettled: (key, ok) => {
              if (key === "brief") {
                setBriefLoading(false);
                return;
              }
              setPending((p) => {
                const n = new Set(p);
                n.delete(key);
                return n;
              });
              metricsSettled += 1;
              // The date line is the page asserting it has today's numbers, so
              // it appears with the first one rather than when nothing answered.
              if (ok && !anyMetric) {
                anyMetric = true;
                setToday(
                  new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                );
              }
              // Every figure has now been asked and none answered: the banner
              // must appear in the same tick the last tile drops its skeleton,
              // or the tiles' empty states stand alone as a claim about the
              // data rather than about the connection.
              if (metricsSettled === METRIC_KEYS.length && !anyMetric) setFailed(true);
            },
          }
        );
        // Bookkeeping only, and deliberately nothing after it: every card
        // painted the moment its own source answered, and the failure verdict
        // is settled in onSettled. This promise resolves on the slowest request
        // of ANY kind, so anything decided here runs late by the difference
        // between the last metric and the brief.
      } catch {
        if (!cancelled) {
          setFailed(true);
          setBriefLoading(false);
          // The token never arrived, so no request was made and no key can
          // settle on its own — leaving them pending skeletons the page forever.
          setPending(new Set());
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [getToken, dateQuery, dateKey, dateReady]);

  // Same two sources, same order, as Overview and Exceptions. Both tolerate a
  // partly-filled payload, so each list grows as its sources land.
  const alerts = [...toAlerts(data.anomalies), ...deriveSystemHealth(data)];
  const actions = deriveActions(data);
  const alertsPending = ALERT_KEYS.some((k) => pending.has(k));
  const actionsPending = ACTION_KEYS.some((k) => pending.has(k));

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

        {/* Above the tiles, because it is the sentence a founder reads first
            on their phone — and below the connection error, because when the
            backend is unreachable there is no narrative either. */}
        {!failed ? <BriefNarrativeCard brief={brief} loading={briefLoading} /> : null}

        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <QuickMetric
            loading={pending.has("sales")}
            label="Orders"
            value={hasOrders ? sales.orders.value.toLocaleString("en-IN") : "No data"}
            note={hasOrders ? pct(sales.orders.changePct) : "Connect a sales channel"}
            tone={hasOrders && (sales.orders.changePct ?? 0) >= 0 ? "positive" : "negative"}
          />
          <QuickMetric
            loading={pending.has("revenue")}
            label="Net revenue"
            badge={<DataStatusBadge dataStatus={data?.revenue?.dataStatus} />}
            value={data?.revenue ? formatInrShort(data.revenue.value) : "No data"}
            note={data?.revenue ? pct(data.revenue.changePct) : "Connect a sales channel"}
            tone={data?.revenue && (data.revenue.changePct ?? 0) >= 0 ? "positive" : "negative"}
          />
          <QuickMetric
            loading={pending.has("rto")}
            label="RTO rate"
            value={rto?.rtoRatePct != null ? `${rto.rtoRatePct}%` : "No data"}
            note={rto?.rtoRatePct != null ? `${rto.rtoCount} of ${rto.dispatchedCount} dispatched` : "Connect a courier"}
            tone={rto?.rtoRatePct != null && rto.rtoRatePct > 10 ? "negative" : "neutral"}
          />
          <QuickMetric
            loading={pending.has("cash")}
            label="Available cash"
            value={hasCash ? formatInrShort(cash.value) : "No data"}
            note={hasCash ? "Bank accounts only" : "Connect a bank account"}
            tone="neutral"
          />
          {/* Profitability was entirely absent from the brief's headline tiles —
              orders, revenue, RTO, cash, and not one word on margin. CM0 is the
              first reliable rung of the ladder; the caveat says which rung. */}
          <QuickMetric
            loading={pending.has("contribution")}
            label="Gross margin (CM0)"
            badge={<DataStatusBadge dataStatus={data?.contribution?.dataStatus} />}
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
          {/* No skeleton while recon is in flight: whether this card exists at
              all depends on the answer, and an absent card claims nothing —
              whereas one that appears and then vanishes would. */}
          {(data?.recon?.codPosition ?? data?.recon?.cod)?.hasCourierData ? (
            <QuickMetric
              label="COD gone dark"
              badge={<DataStatusBadge dataStatus={data?.recon?.codDataStatus} />}
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
            {/* Findings show as they arrive; the skeleton stays below them
                until the last source has answered, because "Nothing flagged"
                is only true once every source has been asked. */}
            {alerts.map((a) => (
              <AlertCard
                key={a.id}
                severity={a.severity}
                title={a.title}
                description={a.description}
                meta={a.meta}
                actionLabel="View details"
                actionHref={a.href}
              />
            ))}
            {alertsPending ? (
              <div className="gcard flex flex-col gap-3 p-5" role="status" aria-busy="true">
                <div className="h-4 w-1/3 animate-pulse rounded-sm bg-primary/10" />
                <div className="h-3 w-4/5 animate-pulse rounded-sm bg-primary/10" />
              </div>
            ) : alerts.length > 0 || failed ? null : (
              <NoDataPanel reason="Nothing flagged against the data available for this period." />
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Recommended today
          </h2>
          <div className="flex flex-col gap-3">
            {actions.map((r) => (
              <AlertCard
                key={r.id}
                severity="info"
                title={r.title}
                description={r.description}
                meta={r.meta}
                actionLabel="Open"
                actionHref={r.href}
              />
            ))}
            {actionsPending ? (
              <div className="gcard flex flex-col gap-3 p-5" role="status" aria-busy="true">
                <div className="h-4 w-1/3 animate-pulse rounded-sm bg-primary/10" />
                <div className="h-3 w-4/5 animate-pulse rounded-sm bg-primary/10" />
              </div>
            ) : actions.length > 0 || failed ? null : (
              <NoDataPanel reason="No outstanding setup actions — every source this brief can check is connected and current." />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
