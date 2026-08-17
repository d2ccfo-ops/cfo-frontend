"use client";

import { useAuth, useOrganization } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import useFlipList from "@/components/hooks/useFlipList";
import { loadProgressively } from "@/components/lib/progressiveLoad";
import TopNav from "@/components/layout/TopNav";
import { AskCfoButton } from "@/components/ai/AskCfoOverlay";
import MetricCard from "@/components/ui/MetricCard";
import MetricCardSkeleton from "@/components/ui/MetricCardSkeleton";
import DataStatusBadge from "@/components/ui/DataStatusBadge";
import { fetchEvidence, evidenceToRows, downloadEvidenceCsv } from "@/lib/evidence";
import { useDateRange } from "@/components/controls/DateRangeContext";
import AlertCard from "@/components/ui/AlertCard";
import FinancialChart from "@/components/charts/FinancialChart";
import RevenueTrendChart from "@/components/charts/RevenueTrendChart";
import EvidenceDrawer from "@/components/ui/EvidenceDrawer";
import StatusBadge from "@/components/ui/StatusBadge";
import { Icon, PLUS_PATHS, WALLET_PATHS, TRENDING_UP_PATHS, PERCENT_PATHS } from "@/components/icons";
import Link from "next/link";
import AbbrCurrency from "@/components/ui/AbbrCurrency";
import TableSkeleton from "@/components/ui/TableSkeleton";
import NoDataPanel from "@/components/ui/NoDataPanel";
import { deriveSystemHealth, deriveActions, formatInrShort } from "@/lib/insights";
import { toAlerts } from "@/lib/anomalies";

function ev(title, sourceLabel, rows) {
  return { title, sourceLabel, rows };
}

// The backend tells us what the prior window actually was, so the card can say
// so instead of always claiming "last month". Month-to-date is compared
// against the same slice of the previous month; any explicit range can only be
// compared against the equal-length window before it. See
// cfo-backend/src/lib/dateRange.ts.
function comparisonLabel(comparison) {
  return comparison === "previous_period"
    ? "vs previous period (live)"
    : "vs same period last month (live)";
}

// Alerts come from two places, and every screen that shows them reads BOTH in
// the same order so they cannot disagree: §17 anomalies from GET /anomalies
// (persisted server-side, mapped by lib/anomalies.js) and system-health
// checks still computed in the browser by lib/insights.js's
// deriveSystemHealth. formatInrShort and deriveActions also live there.

// CARD DEFINITIONS — deliberately carry NO value, change, comparison or
// evidence. They used to, and that was the single most dangerous thing on this
// dashboard: every card had a live branch below, but a branch that didn't fire
// fell through to `return m` and rendered the mock figure instead. With the
// backend down (which happened on 9 Aug 2026) the page showed ₹1.84 Cr of
// invented cash, ₹62.4 L revenue and a 34.2% margin with no error anywhere —
// visually identical to real data. A card with no live data now says so.
//
// `needs` is the honest fallback: what has to be connected for this card to
// have an answer. `formula` is what it would compute once it does.
// The three that lead the page, rendered as the "Today at a glance" hero row
// rather than as cards in the grid below. They are NOT in the pinnable set:
// a founder can reorder and remove the key metrics, but cash, revenue and
// margin are the page's reason for existing and are always the first thing on
// it. That also means they never appear in the "Add metric card" picker —
// offering to add something already on screen is how a picker starts lying.
const HERO_METRICS = [
  { label: "Available cash", goodDirection: "up",
    snapshotKey: "available_cash",
    needs: "Connect a bank account and set its opening balance",
    formula: "Opening balance + credits \u2212 debits, per bank account (\u00a744)" },
  { label: "Net revenue (MTD)", goodDirection: "up",
    // The DAILY flow, not the MTD total, and for two reasons. Only
    // net_revenue_day is in DAILY_SNAPSHOT_METRICS, so an MTD key would be
    // filtered out by /metrics/snapshot-history and the line would silently
    // never appear. And a cumulative MTD series only ever rises — it would
    // draw a reassuring climb under a figure that had just fallen.
    snapshotKey: "net_revenue_day",
    needs: "Connect a sales channel",
    formula: "Gross sales \u2212 discounts \u2212 returns \u2212 GST (\u00a711)" },
  { label: "Contribution margin", goodDirection: "up",
    snapshotKey: "cm3_pct_28d",
    needs: "Product costs, plus a sales channel",
    formula: "Net revenue less COGS, fulfilment, fees and ads (\u00a736)" },
];

// Pinned by default. Deliberately seven, and deliberately NOT the seven that
// happen to be cheapest to compute: these are the ones a founder acts on in a
// week. Cash, revenue and margin are absent because they are in the hero row
// above; everything else moved to EXTRA_METRICS and is one click away in the
// picker.
const METRICS_RAW = [
  { label: "Cash received (MTD)", goodDirection: "up",
    needs: "Connect a bank account",
    formula: "Matched bank credits over the period (\u00a744)" },
  { label: "Pending settlements", goodDirection: "down",
    needs: "Connect Razorpay or a marketplace settlement feed",
    formula: "Expected net settlement \u2212 settled amount, aged (\u00a745)" },
  { label: "Ad spend (MTD)", goodDirection: "down",
    needs: "Connect Meta Ads or Google Ads",
    formula: "Spend across connected ad accounts over the period" },
  { label: "RTO rate", goodDirection: "down",
    needs: "Connect a courier (Shiprocket, Delhivery or ClickPost)",
    formula: "RTO shipments \u00f7 dispatched shipments" },
  { label: "Refund rate", goodDirection: "down",
    needs: "Connect a sales channel",
    formula: "Refunded value \u00f7 tax-exclusive revenue (\u00a766)" },
  { label: "Orders (MTD)", goodDirection: "up",
    needs: "Connect a sales channel",
    formula: "Orders placed over the period" },
  { label: "Marketing efficiency (ROAS)", goodDirection: "up",
    needs: "Connect an ad account and a sales channel",
    formula: "Net revenue \u00f7 ad spend, blended" },
];

// Not pinned by default — offered via the "Add metric card" picker below,
// matching ai-cfo-design's KEY_METRICS/EXTRA_METRICS split (its Overview
// route lets a founder pin/unpin which cards show).
const EXTRA_METRICS = [
  { label: "Upcoming payments", goodDirection: "down",
    needs: "Connect an accounting system (Zoho Books)",
    formula: "Invoice total \u2212 payments \u2212 credit notes, aged by due date (\u00a757)" },
  { label: "Data freshness", goodDirection: "up",
    needs: "Connect at least one source",
    formula: "Last completed sync per connection" },
  { label: "Gross sales (MTD)", goodDirection: "up",
    needs: "Connect a sales channel",
    formula: "Order value before discounts and tax (\u00a75)" },
  { label: "Average order value", goodDirection: "up",
    needs: "Connect a sales channel",
    formula: "Gross sales \u00f7 order count (\u00a764)" },
  { label: "Inventory value", goodDirection: "up",
    needs: "Connect a sales channel that reports stock",
    formula: "Retail price \u00d7 quantity on hand" },
  { label: "Burn rate", goodDirection: "down",
    needs: "Connect a bank account",
    formula: "Bank debits \u2212 credits, annualised monthly (\u00a755)" },
  { label: "Runway", goodDirection: "up",
    needs: "Connect a bank account",
    formula: "Available cash \u00f7 monthly net burn (\u00a785)" },
];

// WHICH REQUEST FEEDS WHICH CARD.
//
// The seventeen requests below are independent and land at very different
// times, so the page paints each answer as it arrives rather than holding
// everything for the slowest. That only works if a card knows which request
// its own figure comes from: rendering a card whose payload has not arrived
// makes the derivation fall through to "No data / Not connected", which is a
// confident false statement about a source that is merely slow.
//
// Derived from the live* branches in the card derivation below — a label
// missing here (Pending settlements) has no live source at all and correctly
// renders its "not connected" state immediately rather than waiting.
const LIVE_KEYS = [
  "revenue", "rto", "cash", "availableCash", "adSpend", "adEfficiency", "sales",
  "freshness", "inventoryValue", "contribution", "ladder", "products", "burn",
  "payables", "recon", "anomalies", "snapshot",
];

// GET /metrics/overview answers for thirteen of the keys above in one request.
// Its response is keyed by the URL segment of the endpoint each figure used to
// come from; these are this page's own names for the same things. Kept as an
// explicit map rather than derived, because a silent mismatch here does not
// error — the card simply never leaves its skeleton.
const OVERVIEW_KEY_BY_METRIC = {
  "revenue": "revenue",
  "rto-rate": "rto",
  "cash-received": "cash",
  "available-cash": "availableCash",
  "ad-spend": "adSpend",
  "ad-efficiency": "adEfficiency",
  "sales": "sales",
  "inventory-value": "inventoryValue",
  "contribution-margin": "contribution",
  "revenue-ladder": "ladder",
  "product-profitability": "products",
  "burn-runway": "burn",
  "payables": "payables",
};
const OVERVIEW_KEYS = Object.values(OVERVIEW_KEY_BY_METRIC);

const CARD_SOURCES = {
  "Available cash": ["availableCash"],
  // revenue alone. The hero's sparkline comes from `snapshot`, deliberately
  // NOT listed: Sparkline renders nothing below its minimum point count, so
  // "no line yet" is already the honest rendering, and gating on it would hold
  // the three most important numbers on the page for the slowest request.
  "Net revenue (MTD)": ["revenue"],
  "Contribution margin": ["contribution"],
  "Cash received (MTD)": ["cash"],
  "Ad spend (MTD)": ["adSpend"],
  "RTO rate": ["rto"],
  "Refund rate": ["sales"],
  "Orders (MTD)": ["sales"],
  "Marketing efficiency (ROAS)": ["adEfficiency"],
  "Upcoming payments": ["payables"],
  "Data freshness": ["freshness"],
  "Gross sales (MTD)": ["sales"],
  "Average order value": ["sales"],
  "Inventory value": ["inventoryValue"],
  "Burn rate": ["burn"],
  Runway: ["burn"],
};

// The two lists at the foot of the page each read several payloads, so they
// wait for exactly their own inputs and no more.
// Exactly the inputs each derivation reads — toAlerts(anomalies) plus
// deriveSystemHealth's five, and deriveActions' three. An extra key here is
// not a bug but a needless wait: it would hold the list for a request whose
// answer it never reads.
const ANOMALY_SOURCES = ["anomalies", "ladder", "contribution", "freshness", "burn", "recon"];
const ACTION_SOURCES = ["contribution", "freshness", "products"];

// The Overview's charts and product tables are all live now, so the mock
// series that used to feed them are gone rather than left dormant — dead mock
// data next to real data is how a fabricated number gets re-wired by accident.
// Sections with no data source render <NoDataPanel> instead.

// §40 per-SKU table. `cm0` is null for any SKU whose lines aren't all costed,
// and the cell says "—" rather than rendering a margin computed from partial
// cost data.

// The pinned cards carry "(MTD)" in their label because that is their identity
// key throughout this file — it drives the live-data matching, the remove and
// the drag reorder. But the label is also what a founder reads, and with the
// picker on "Today" a card headed "Net revenue (MTD)" is simply lying about
// which period it answers for. So the identity stays put and only the DISPLAYED
// label is rewritten to whatever period is actually selected.
const PERIOD_SUFFIX = {
  "Month to date": "MTD",
  Today: "Today",
  "Last 7 days": "7 days",
  "Last 30 days": "30 days",
  "This quarter": "Quarter",
  "This financial year": "FY",
  "Custom range": "Selected range",
};

function forPeriod(label, preset) {
  if (!label.includes("(MTD)")) return label;
  return label.replace("(MTD)", `(${PERIOD_SUFFIX[preset] ?? preset})`);
}

// A saved layout stores card LABELS — the identity key used throughout this
// file — not whole card objects. Rebuilding from the catalogue on load means a
// layout saved months ago still picks up today's copy, evidence rows and spec
// references, and a card this build no longer ships is dropped rather than
// rendering an empty tile.
// Returns null when the saved layout is STALE and should be discarded in
// favour of the current defaults — the caller treats null as "never
// customised".
function orderFromLabels(labels) {
  const catalogue = new Map([...METRICS_RAW, ...EXTRA_METRICS].map((m) => [m.label, m]));
  const restored = labels.map((l) => catalogue.get(l)).filter(Boolean);
  // An empty result from a non-empty save means every card in it has been
  // renamed or retired, which is a broken layout rather than a deliberate one —
  // fall back to the default set instead of showing a blank dashboard. A user
  // who genuinely removed every card saved an empty list, and that is honoured.
  if (labels.length > 0 && restored.length === 0) return null;
  // A saved layout that names a card no longer in the catalogue was written by
  // an older version of this page. Right now there is exactly one way that
  // happens: cash, net revenue and contribution margin moved out of the grid
  // and into the "Today at a glance" hero row, so a pre-move layout still lists
  // them and they silently vanish here.
  //
  // Honouring the remnant is the wrong call. What is left is not a set anyone
  // chose — it is an old default with three holes punched in it, which is why
  // this page kept showing Gross sales and Average order value as though they
  // were headline metrics. Discard it and use the current defaults; the moment
  // the founder reorders or adds anything, that choice saves normally and is
  // respected from then on.
  if (restored.length !== labels.length) return null;
  return restored;
}

function labelKey(metrics) {
  return metrics.map((m) => m.label).join("\u0000");
}

// Spells out §11 for one SKU in rupees, skipping deductions that are zero so a
// clean product doesn't hand back three lines of "− ₹0.00".
function netRevenueBridge(p) {
  if (p.billed == null) return undefined;
  const rupees = (v) =>
    `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const parts = [`${rupees(p.billed)} billed`];
  if (p.discounts) parts.push(`− ${rupees(p.discounts)} discount`);
  if (p.gst) parts.push(`− ${rupees(p.gst)} GST`);
  if (p.refunds) parts.push(`− ${rupees(p.refunds)} returns`);
  return `${parts.join("  ")}  =  ${rupees(p.netRevenue)} net revenue`;
}

// "Today at a glance" — the design's HeroMetric, and the first consumer of the
// ink token family.
//
// Two things here are deliberately NOT the design.
//
// The sparkline. ai-cfo-design hardcodes HERO_SERIES = { "Available cash":
// [14.2, 15.1, 14.6, ...] } — six invented points per metric. The real series
// is GET /metrics/snapshot-history, which only has a point for each night the
// capture job actually ran. So the line is drawn from measured history or it
// is not drawn at all: below MIN_SPARK_POINTS the card renders without one,
// because two points joined by a straight line is not a trend, it is a
// decoration that looks like evidence.
//
// The status pill. The design carries status/statusTone ("On track", "Watch",
// "Needs attention") — a judgement no endpoint makes. The change chip, which
// IS measured, does that work instead.
const MIN_SPARK_POINTS = 4;

const HERO_ICONS = {
  "Available cash": WALLET_PATHS,
  "Net revenue (MTD)": TRENDING_UP_PATHS,
  "Contribution margin": PERCENT_PATHS,
};

function Sparkline({ points, tone }) {
  if (!points || points.length < MIN_SPARK_POINTS) return null;
  const w = 132;
  const h = 44;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  // A flat series would divide by zero and, worse, would draw a line through
  // the middle implying stability it has not measured. Draw it on the baseline.
  const span = hi - lo || 1;
  const step = w / (points.length - 1);
  const coords = points.map((v, i) => [i * step, h - ((v - lo) / span) * (h - 6) - 3]);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const last = coords[coords.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden="true" className="flex-none">
      <path d={area} fill={tone} fillOpacity="0.12" />
      <path d={line} stroke={tone} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={tone} />
    </svg>
  );
}

function HeroMetric({ m, ink, points, onEvidence }) {
  // Derived exactly as MetricCard derives it, and derived rather than read off
  // the object because there is no `changeTone` field to read — the enrichment
  // emits `changeDirection` ("up"/"down"/"flat") and the metric carries its own
  // `goodDirection`, because down is good for RTO rate and bad for cash. An
  // earlier version of this component read m.changeTone, got undefined, and
  // rendered every hero change green — including a 9.6% fall in revenue.
  const isGood = m.changeDirection === "flat" || m.changeDirection === undefined
    ? true
    : m.changeDirection === (m.goodDirection ?? "up");
  const negative = !isGood;
  const tone = ink
    ? "var(--color-ink-foreground)"
    : negative
      ? "var(--color-destructive)"
      : "var(--color-success)";
  return (
    <div className={`lift flex flex-col p-7 ${ink ? "inkcard" : "gcard"}`}>
      <div className="flex items-center gap-3">
        <span
          className="icon-tile"
          style={ink ? { background: "color-mix(in oklab, var(--color-ink-foreground) 12%, transparent)", color: "var(--color-ink-foreground)" } : undefined}
        >
          <Icon paths={HERO_ICONS[m.label] ?? WALLET_PATHS} size={18} />
        </span>
        <span className={`text-[13px] font-medium ${ink ? "text-ink-muted" : "text-muted-foreground"}`}>
          {m.label}
        </span>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className={`num whitespace-nowrap text-[26px] font-semibold leading-tight sm:text-[32px] lg:text-[40px] ${ink ? "text-ink-foreground" : "text-foreground"}`}>
            {m.value}
          </div>
          {m.change ? (
            <div className="mt-3 flex items-center gap-2">
              <span
                className={`num flex-none rounded-full px-2 py-0.5 text-[12px] font-medium ${
                  ink
                    ? "text-ink-foreground"
                    : negative
                      ? "bg-destructive-soft text-destructive"
                      : "bg-success-soft text-success"
                }`}
                style={ink ? { background: "color-mix(in oklab, var(--color-ink-foreground) 14%, transparent)" } : undefined}
              >
                {m.change}
              </span>
              <span className={`truncate text-xs ${ink ? "text-ink-muted" : "text-muted-foreground"}`}>
                {m.note}
              </span>
            </div>
          ) : null}
        </div>
        <Sparkline points={points} tone={tone} />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <span className={`text-xs ${ink ? "text-ink-muted" : "text-muted-foreground"}`}>{m.updated}</span>
        {m.evidence ? (
          <button
            type="button"
            onClick={onEvidence}
            className={`cursor-pointer text-xs font-medium underline-offset-4 hover:underline ${ink ? "text-ink-foreground" : "text-foreground"}`}
          >
            Evidence
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LiveProductTable({ title, subtitle, rows, loading, footnote }) {
  // §40 asks for refund % per SKU. Shown only when something was actually
  // returned in the period, so a clean month doesn't carry a column of zeroes.
  const showReturns = rows.some((p) => (p.unitsRefunded ?? 0) > 0);
  const columns = showReturns ? 5 : 4;
  return (
    <div className="gcard p-5">
      <div className="text-base font-medium text-foreground">{title}</div>
      <div className="mb-2.5 text-xs text-muted-foreground">{subtitle}</div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Units</th>
              <th>Net revenue</th>
              {showReturns ? <th>Returns</th> : null}
              <th>CM0</th>
            </tr>
          </thead>
          {loading ? (
            <TableSkeleton rows={5} columns={columns} />
          ) : (
            <tbody>
              {rows.map((p) => (
                <tr key={p.sku}>
                  <td className="max-w-[220px] truncate" title={p.productName}>{p.productName}</td>
                  {/* Units net of returns — a product returned as often as it
                      sells shouldn't read as a bestseller. */}
                  <td title={p.unitsRefunded ? `${p.unitsSold} sold − ${p.unitsRefunded} returned` : undefined}>
                    {p.units.toLocaleString("en-IN")}
                  </td>
                  {/* Hovering shows how the billed figure becomes the revenue
                      figure. "3 x ₹899 = ₹2,697" is the number a founder has in
                      their head; ₹2,618 with no bridge to it reads as a bug, when
                      the ₹79 gap is GST they collect for the state and remit. */}
                  <td title={netRevenueBridge(p)}><AbbrCurrency value={p.netRevenue} /></td>
                  {showReturns ? (
                    <td className={p.refundRatePct > 5 ? "font-medium text-destructive" : "text-muted-foreground"}>
                      {p.refundRatePct ? `${p.refundRatePct}%` : "—"}
                    </td>
                  ) : null}
                  <td
                    className="font-medium"
                    style={{ color: p.cm0 == null ? undefined : p.cm0 < 0 ? "var(--color-destructive)" : "var(--color-primary)" }}
                  >
                    {p.cm0 == null ? <span className="text-muted-foreground">—</span> : `${p.cm0Pct}%`}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns} className="py-6 text-center text-muted-foreground">No orders in this period.</td>
                </tr>
              ) : null}
            </tbody>
          )}
        </table>
      </div>
      {footnote ? <div className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">{footnote}</div> : null}
    </div>
  );
}

export default function OverviewPage() {
  const [drawer, setDrawer] = useState({ open: false, title: "", sourceLabel: "", rows: [], evidenceKey: null });
  const closeDrawer = () => setDrawer((d) => ({ ...d, open: false }));

  const { getToken, isLoaded } = useAuth();
  const { organization } = useOrganization();
  // getToken is something this page CALLS, not something it reacts to — but
  // Clerk hands back a new function identity once the session finishes
  // hydrating, and the live-data effect below listed it as a dependency. That
  // made the whole seventeen-request load run twice on every page view, the
  // second wave starting ~4s after the first while the first was still in
  // flight. Held in a ref so the effect depends only on what actually changes
  // the ANSWER: the date range.
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);
  const [liveRevenue, setLiveRevenue] = useState(null);
  const [liveRto, setLiveRto] = useState(null);
  const [liveCash, setLiveCash] = useState(null);
  const [liveAvailableCash, setLiveAvailableCash] = useState(null);
  const [liveAdSpend, setLiveAdSpend] = useState(null);
  const [liveAdEfficiency, setLiveAdEfficiency] = useState(null);
  const [liveSales, setLiveSales] = useState(null);
  const [liveFreshness, setLiveFreshness] = useState(null);
  // Real captured history for the hero sparklines, keyed by snapshot metric.
  // Empty until the nightly job has run enough nights; the cards render
  // without a line rather than with an invented one.
  const [heroSeries, setHeroSeries] = useState({});
  const [liveInventoryValue, setLiveInventoryValue] = useState(null);
  const [liveContribution, setLiveContribution] = useState(null);
  const [liveLadder, setLiveLadder] = useState(null);
  const [liveProducts, setLiveProducts] = useState(null);
  const [liveBurn, setLiveBurn] = useState(null);
  const [livePayables, setLivePayables] = useState(null);
  const [liveRecon, setLiveRecon] = useState(null);
  const [liveAnomalies, setLiveAnomalies] = useState(null);
  // WHICH REQUESTS ARE STILL IN FLIGHT, so each card can wait for its own
  // answer instead of for the slowest of seventeen. Measured live: the
  // cheapest of these endpoints answers in ~40ms and the dearest in ~1,000ms,
  // and the old single `loadingLive` flag held every card at a skeleton until
  // the last one landed.
  //
  // A card must never be rendered against a payload that has not arrived yet:
  // the derivation below falls through to "No data / Not connected" when its
  // live* payload is null, which would state that a source is missing when it
  // is merely slow. So a card shows ITS OWN skeleton until ITS OWN key clears,
  // and only then renders — including its legitimate empty state.
  const [pending, setPending] = useState(() => new Set(LIVE_KEYS));
  // True when the request to cfo-backend itself failed (network error, backend
  // down). Distinct from "the backend answered and had nothing" — the cards and
  // the banner below say which one it is rather than showing the same blank.
  const [liveFailed, setLiveFailed] = useState(false);
  // WHICH individual requests failed. Before this page loaded progressively,
  // Promise.all rejected on the first failure and every card said "Backend
  // unreachable" — including the sixteen whose data had arrived fine. Now each
  // card answers for its own request: one that failed says it could not ask,
  // and one that simply has no source says so instead. Those are different
  // facts and a founder acts differently on each.
  const [failedKeys, setFailedKeys] = useState(() => new Set());
  const { query: dateQuery, key: dateKey, preset: datePreset, ready: dateReady } = useDateRange();

  // True while a card's own source has not answered yet. A card with no live
  // source (Pending settlements) is never pending — its "not connected" state
  // is already the truth and it paints on the first frame.
  const cardPending = (label) => (CARD_SOURCES[label] ?? []).some((k) => pending.has(k));
  const anyPending = (keys) => keys.some((k) => pending.has(k));
  // "We could not ask" — true only for a card whose OWN request failed.
  const cardFailed = (label) => (CARD_SOURCES[label] ?? []).some((k) => failedKeys.has(k));

  // Local rows paint immediately; for the material metrics (evidenceKey set)
  // the §21 server envelope is fetched and appended when it lands — the
  // backend's verification status, live sources and underlying rows are facts
  // only it can state. A failed fetch leaves the local rows, which are still
  // true.
  const openDrawer = (payload, evidenceKey = null) => {
    setDrawer({ open: true, evidenceKey, ...payload });
    if (!evidenceKey) return;
    (async () => {
      try {
        const token = await getToken();
        const env = await fetchEvidence(token, evidenceKey, dateQuery);
        const serverRows = evidenceToRows(env, { includeText: false });
        setDrawer((d) =>
          d.open && d.evidenceKey === evidenceKey ? { ...d, rows: [...d.rows, ...serverRows] } : d
        );
      } catch {
        /* local rows stand alone */
      }
    })();
  };

  const [pinned, setPinned] = useState(METRICS_RAW);
  const [picker, setPicker] = useState(false);
  const [info, setInfo] = useState(null);
  // Which cards are pinned and in what order is stored SERVER-side, per user
  // per org, so the dashboard someone curates on a laptop is the dashboard they
  // find on a phone. `layoutLoaded` gates both the first render and the save
  // effect below — writing before the load returns would push the default set
  // over whatever the user had saved.
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  // What the server is known to hold. Compared against before every save so a
  // page load doesn't immediately PUT back the layout it just fetched, and so a
  // user who never customises never has a row created for them at all.
  const persistedOrderRef = useRef(null);
  // Set only while migrating away from a layout saved before the hero row
  // existed; carries what the server still has so the save effect can see a
  // difference and clean it up. Cleared immediately after.
  const staleLayoutRef = useRef(null);

  // isLoaded, because Clerk resolves getToken to null until the session has
  // hydrated and this effect ran before it. Measured on the live deployment:
  // every cold load sent `Bearer null`, took a 401, and rendered the shipped
  // default order in place of whatever the reader had arranged. It corrected
  // itself on the next getToken identity, so the cost was a wasted round trip
  // and a visible flash of the wrong layout rather than a lost one — but both
  // are avoidable by waiting for the answer Clerk is about to give.
  //
  // The token is then read through the ref rather than the dep, so the ~60s
  // rotation does not re-run this and re-fetch a preference that cannot have
  // changed. isLoaded flips once and stays; nothing else here needs to.
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      let restored = null;
      try {
        const token = await getTokenRef.current();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/preferences/dashboard-layout?page=overview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.ok) {
          const { cardOrder } = await res.json();
          restored = cardOrder ? orderFromLabels(cardOrder) : null;
          if (restored) setPinned(restored);
          // A stored layout that orderFromLabels rejected: seed the "last
          // persisted" ref with what the SERVER still holds, not with the
          // defaults we are about to render. The two now differ, so the save
          // effect fires once and overwrites the stale row. Seeding it with the
          // defaults instead would look consistent and quietly leave the old
          // layout in the database, re-migrating on every single page load.
          if (cardOrder?.length > 0 && restored === null) {
            staleLayoutRef.current = labelKey(cardOrder.map((label) => ({ label })));
          }
        }
      } catch {
        // Layout is a preference, not data. If it can't be reached the page
        // still works on the shipped default rather than showing an error.
      } finally {
        if (!cancelled) {
          persistedOrderRef.current = staleLayoutRef.current ?? labelKey(restored ?? METRICS_RAW);
          staleLayoutRef.current = null;
          setLayoutLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded]);

  // Saved whenever the set or order actually changes. No debounce needed: add
  // and remove are single clicks, and reorderTo returns the same array
  // reference when nothing moved, so a drag doesn't fire a save per pixel.
  useEffect(() => {
    if (!layoutLoaded) return;
    const next = labelKey(pinned);
    if (next === persistedOrderRef.current) return;
    persistedOrderRef.current = next;

    const controller = new AbortController();
    (async () => {
      try {
        // Through the ref, not the dep. With getToken listed below, a token
        // rotation re-ran this effect and its cleanup aborted the PUT that was
        // still in flight — and persistedOrderRef was already advanced to the
        // new order, so the save was dropped and never retried. The layout
        // would then be lost on the next load with nothing on screen having
        // suggested it.
        const token = await getTokenRef.current();
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/preferences/dashboard-layout`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ page: "overview", cardOrder: pinned.map((m) => m.label) }),
          signal: controller.signal,
        });
      } catch {
        // Same reasoning as the load: a failed save costs the layout, not the
        // page. Nothing on screen changes, because local state already did.
      }
    })();
    return () => controller.abort();
  }, [pinned, layoutLoaded]);

  const available = [...METRICS_RAW, ...EXTRA_METRICS].filter(
    (m) => !pinned.some((x) => x.label === m.label),
  );
  const addMetric = (m) => {
    setPinned((cur) => [...cur, m]);
    setPicker(false);
  };
  const removeMetric = (label) => setPinned((cur) => cur.filter((x) => x.label !== label));

  // Reordering is tracked by label rather than index: the array is spliced
  // live while the pointer moves, so an index captured at drag-start goes
  // stale the moment the first swap lands.
  const [dragLabel, setDragLabel] = useState(null);
  const gridRef = useRef(null);
  useFlipList(gridRef, [pinned]);

  const reorderTo = (targetIndex) => {
    if (!dragLabel) return;
    setPinned((cur) => {
      const from = cur.findIndex((m) => m.label === dragLabel);
      if (from === -1 || from === targetIndex) return cur;
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  // Proves the real chain end to end: auth -> org scoping -> date range ->
  // calc engine -> API -> here. Re-runs whenever the header's date filter
  // changes (dateKey), so the cards and the picker can never disagree about
  // which period is on screen. Some cards are still mock — see
  // cfo-docs/PROGRESS.md for what's real vs. not yet wired up.
  //
  // /freshness and /inventory-value deliberately take no date parameters:
  // both are point-in-time and return periodFiltered: false. See the comments
  // in cfo-backend/src/modules/calc/{freshness,inventory}.ts.
  useEffect(() => {
    // Held until the stored date selection has been read back, so a reload
    // doesn't fetch the default period, paint it, then refetch the real one.
    if (!dateReady) return;
    let cancelled = false;
    // The `cancelled` flag alone only stopped the RESULTS being used — every
    // one of the seventeen requests kept running to completion on the server,
    // burning the same CPU as a wanted one. On a single-threaded Node process
    // that is not free: superseded work competes with the work you are waiting
    // for. Aborting actually cancels it.
    const controller = new AbortController();
    async function loadLive() {
      setLiveFailed(false);
      // Back to skeletons for the new period. Without this the cards would
      // keep showing the OLD range's figures under the new range's heading
      // until each request returned — a wrong number presented as a filtered
      // one, which is the worst shape a wrong number can take.
      setPending(new Set(LIVE_KEYS));
      setFailedKeys(new Set());
      // Clear the PERIOD-SCOPED payloads. Pending gates the skeletons during a
      // normal load, but a request that FAILS settles its key without writing
      // anything — and the card would then match on the payload still held
      // from the last period and render those figures under this period's
      // heading. A wrong number presented as a filtered one is the worst shape
      // a wrong number can take.
      //
      // The undated requests (freshness, inventory-value, burn-runway,
      // payables, anomalies, snapshot-history) are deliberately NOT cleared:
      // they carry no date parameter, so their answer is identical across a
      // range change and dropping them would blank cards for no reason.
      setLiveRevenue(null);
      setLiveRto(null);
      setLiveCash(null);
      setLiveAvailableCash(null);
      setLiveAdSpend(null);
      setLiveAdEfficiency(null);
      setLiveSales(null);
      setLiveContribution(null);
      setLiveLadder(null);
      setLiveProducts(null);
      setLiveRecon(null);
      try {
        const token = await getTokenRef.current();
        const authed = { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal };
        const api = process.env.NEXT_PUBLIC_API_URL;
        // No Promise.all barrier: each response is applied the moment it
        // lands, so a 40ms card is on screen while a 1,000ms one is still in
        // flight. See components/lib/progressiveLoad.js.
        const { ok } = await loadProgressively(
          [
            // THIRTEEN CARDS, ONE REQUEST. Each figure is still computed by the
            // same calc module the individual endpoint used — /metrics/overview
            // holds no arithmetic of its own — so nothing here changes what any
            // number means.
            //
            // WHAT IT COSTS: these thirteen now paint together rather than one
            // by one. Warm that is a single ~50ms request and strictly better
            // than thirteen; cold it is one wait instead of a staggered fill.
            // The durable cache behind calcCache makes cold rare (a write, not
            // a clock, is what empties it now), which is what makes the trade
            // worth taking. The remaining keys below still stream in
            // independently, so the page has not gone back to a barrier.
            //
            // 207 is a SUCCESS here: some metrics answered and some did not.
            // res.ok covers it, `metrics` carries whatever worked, and `failed`
            // names the rest so those cards fall through to their own error
            // state instead of a skeleton that never ends.
            {
              key: "overview",
              url: `${api}/metrics/overview${dateQuery}`,
              apply: (data) => {
                const metrics = data?.metrics ?? {};
                const applyByMetric = {
                  "revenue": setLiveRevenue,
                  "rto-rate": setLiveRto,
                  "cash-received": setLiveCash,
                  "available-cash": setLiveAvailableCash,
                  "ad-spend": setLiveAdSpend,
                  "ad-efficiency": setLiveAdEfficiency,
                  "sales": setLiveSales,
                  "inventory-value": setLiveInventoryValue,
                  "contribution-margin": setLiveContribution,
                  "revenue-ladder": setLiveLadder,
                  "product-profitability": setLiveProducts,
                  "burn-runway": setLiveBurn,
                  "payables": setLivePayables,
                };
                for (const [metric, setter] of Object.entries(applyByMetric)) {
                  if (metrics[metric] !== undefined) setter(metrics[metric]);
                }
                // A section the server could not compute is a failed card, not
                // an empty one — same distinction the loader draws for a whole
                // request that failed.
                const failedMetrics = Object.keys(data?.failed ?? {});
                if (failedMetrics.length > 0) {
                  setFailedKeys((prev) => {
                    const next = new Set(prev);
                    for (const m of failedMetrics) {
                      const key = OVERVIEW_KEY_BY_METRIC[m];
                      if (key) next.add(key);
                    }
                    return next;
                  });
                }
              },
            },
            { key: "freshness", url: `${api}/metrics/freshness`, apply: setLiveFreshness },
            // For the COD position card — the landing page never showed the money
            // couriers are holding (or have gone silent on), which is the single
            // largest number in the system.
            { key: "recon", url: `${api}/reconciliation/summary${dateQuery}`, apply: setLiveRecon },
            // §17 anomalies. Deliberately not date-filtered — the engine runs
            // on its own trailing-28-day window, so scoping to the picker
            // would hide findings whose window doesn't line up with it.
            { key: "anomalies", url: `${api}/anomalies`, apply: setLiveAnomalies },
            // Captured nightly history, for the hero sparklines. 30 days
            // requested; far fewer usually come back, and that is the point —
            // the line is only drawn from nights that were actually measured.
            {
              key: "snapshot",
              url: `${api}/metrics/snapshot-history?days=30`,
              apply: (snap) => {
                // Shape is { series: [{ metric: DailyMetricSpec, points: [...] }] },
                // already ordered oldest-first by periodStart, which is the order the
                // sparkline draws in. A point whose value is null was captured but
                // not measurable that night; dropping it leaves a shorter real series
                // rather than a line through a gap that was never observed.
                const byKey = {};
                for (const row of snap.series ?? []) {
                  const key = row?.metric?.key;
                  if (!key) continue;
                  const pts = (row.points ?? [])
                    .map((pt) => (pt.value ?? pt.valueNumeric))
                    .filter((v) => typeof v === "number" && Number.isFinite(v));
                  if (pts.length) byKey[key] = pts;
                }
                setHeroSeries(byKey);
              },
            },
          ],
          {
            init: authed,
            isCancelled: () => cancelled,
            // A new Set each time, because React compares by reference — a
            // mutated one would never re-render and no card would ever leave
            // its skeleton.
            onSettled: (key, ok) => {
              // "overview" is one request standing in for thirteen cards. The
              // loader only knows the request; the page tracks the cards. If
              // this expansion were missing, a failed batch would leave all
              // thirteen pending forever — thirteen skeletons that never
              // resolve, which is the worst state this page can be in because
              // it looks like loading rather than like an error.
              const keys = key === "overview" ? OVERVIEW_KEYS : [key];
              if (!ok) {
                setFailedKeys((prev) => {
                  const next = new Set(prev);
                  for (const k of keys) next.add(k);
                  return next;
                });
              }
              setPending((prev) => {
                const next = new Set(prev);
                for (const k of keys) next.delete(k);
                return next;
              });
            },
          }
        );
        // Not one failure — every single request failed, which means the
        // backend could not be reached at all rather than having nothing to
        // say. This flag is what separates "nothing is connected" from "we
        // could not ask", two very different things that used to look
        // identical.
        if (!cancelled && ok === 0) setLiveFailed(true);
      } catch {
        // The token itself failed, so no request was ever made and nothing
        // will ever settle these keys. Release every card from its skeleton
        // and mark all sources unreachable — a skeleton with nothing behind
        // it is a page that hangs, which is worse than an honest failure.
        if (!cancelled) {
          setLiveFailed(true);
          setFailedKeys(new Set(LIVE_KEYS));
          setPending(new Set());
        }
      }
    }
    loadLive();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // getToken deliberately absent — see getTokenRef above. Listing it made
    // this effect re-run when Clerk rehydrated the session, doubling the load.
  }, [dateQuery, dateKey, dateReady]);

  // Charts read the same live payloads the cards do, so a chart can never
  // disagree with the card above it. (The revenue-vs-cash series is built
  // inside RevenueTrendChart, which owns the zoom window and rebuilds it on
  // every re-bucket.)
  const channelSeries = liveLadder?.byChannel?.length
    ? [{ name: "Net revenue", colorRole: "accent", points: liveLadder.byChannel.map((c) => ({ x: c.channel, y: c.netRevenue.value })) }]
    : [];

  // Server §17 findings first, then the client-side system-health checks —
  // the same two sources, in the same order, as the Exceptions and Daily
  // brief pages, so the three screens cannot disagree about what is wrong.
  const anomalies = [
    ...toAlerts(liveAnomalies),
    ...deriveSystemHealth({
      ladder: liveLadder,
      contribution: liveContribution,
      freshness: liveFreshness,
      burn: liveBurn,
      recon: liveRecon,
    }),
  ];
  const actions = deriveActions({
    contribution: liveContribution,
    freshness: liveFreshness,
    products: liveProducts,
  });

  // Extracted from `pinned.map(...)` so the hero row runs through the SAME
  // enrichment as the grid. The alternative — a second mapping for three
  // metrics — is how "Available cash" on the hero and "Available cash" in a
  // drawer end up disagreeing after someone edits one of them.
  const enrich = (m) => {
    if (m.label === "Net revenue (MTD)" && liveRevenue) {
      const changeDirection = liveRevenue.changePct == null ? "flat" : liveRevenue.changePct >= 0 ? "up" : "down";
      const changeLabel =
        liveRevenue.changePct == null ? "No prior data" : `${liveRevenue.changePct >= 0 ? "+" : ""}${liveRevenue.changePct}%`;
      return {
        ...m,
        dataStatus: liveRevenue.dataStatus,
        evidenceKey: "revenue",
        value: formatInrShort(liveRevenue.value),
        change: changeLabel,
        changeDirection,
        comparison: comparisonLabel(liveRevenue.comparison),
        updated: "Just now",
        evidence: ev("Net revenue", "Live from cfo-backend — real orders, not mock data", [
          { label: "Net revenue (MTD)", value: formatInrShort(liveRevenue.value) },
          { label: "Same period last month", value: formatInrShort(liveRevenue.priorValue) },
          { label: "Orders counted", value: String(liveRevenue.orderCount) },
          { label: "Formula version", value: liveRevenue.formulaVersion },
        ]),
      };
    }

    // Gross sales, order count, AOV, discount rate and refund rate all come
    // from the single /metrics/sales call. orderCount === 0 keeps the mock
    // card in place for every one of them: with no orders synced, "₹0" and
    // "0%" would read as real business facts rather than "nothing connected".
    const salesHasOrders = liveSales && liveSales.orders.value > 0;

    if (m.label === "Gross sales (MTD)" && salesHasOrders) {
      const pct = liveSales.grossSales.changePct;
      return {
        ...m,
        value: formatInrShort(liveSales.grossSales.value),
        change: pct == null ? "No prior data" : `${pct >= 0 ? "+" : ""}${pct}%`,
        changeDirection: pct == null ? "flat" : pct >= 0 ? "up" : "down",
        comparison: comparisonLabel(liveSales.comparison),
        updated: "Just now",
        evidence: ev("Gross sales", "Live from cfo-backend — order value before discounts and tax", [
          { label: "Gross sales (MTD)", value: formatInrShort(liveSales.grossSales.value) },
          { label: "Same period last month", value: formatInrShort(liveSales.grossSales.priorValue) },
          { label: "Orders (MTD)", value: String(liveSales.orders.value) },
          { label: "Discounts given", value: formatInrShort(liveSales.discounts.value) },
          {
            label: "Discount rate",
            value: liveSales.discounts.ratePct == null ? "—" : `${liveSales.discounts.ratePct}%`,
          },
          { label: "Formula version", value: liveSales.formulaVersion },
        ]),
      };
    }

    // Two cards with no data source at all. §45 pending settlement needs
    // Settlement rows (the Razorpay connector writes them, but no Razorpay
    // connection has ever synced — measured: 0 settlements, 0 payments), and
    // §57 upcoming payments needs accounts payable, which needs an accounting
    // integration that doesn't exist. Showing the old mock figures here was the
    // worst option available: ₹18.6 L of "pending settlements" is a number a
    // founder would act on. These now say what's missing and how to fix it.
    if (m.label === "Pending settlements") {
      return {
        ...m,
        value: "No data",
        change: "Connect a gateway",
        changeDirection: "flat",
        status: "neutral",
        statusLabel: "Not connected",
        comparison: "Needs Razorpay or a marketplace settlement feed (§45)",
        updated: "—",
        evidence: ev("Pending settlements", "No source connected", [
          { label: "Formula (§45)", value: "Expected net settlement − settled amount, aged 0-1/2-3/4-7/8-15/15+ days" },
          { label: "Needs", value: "Razorpay, Amazon or Flipkart settlement data" },
          { label: "Currently", value: "0 settlement records and 0 payment records for this organisation" },
          { label: "Why blank", value: "A fabricated settlement figure is money a founder would chase" },
        ]),
      };
    }

    // §57 accounts payable, live from vendor bills once an accounting system is
    // connected. Until then it says exactly what's missing rather than showing
    // the ₹7.2 L of fiction that used to sit here.
    if (m.label === "Upcoming payments") {
      const p = livePayables;
      if (!p || !p.connected) {
        return {
          ...m,
          value: "No data",
          change: "Connect accounting",
          changeDirection: "flat",
          status: "neutral",
          statusLabel: "Not connected",
          comparison: "Needs vendor bills from an accounting system (§57)",
          updated: "—",
          evidence: ev("Upcoming payments", "No accounting system connected", [
            { label: "Formula (§57)", value: "Invoice total − payments applied − credit notes, aged by due date" },
            { label: "Needs", value: "Zoho Books (available on the Connections page)" },
            { label: "Tally", value: "On-premise — needs a desktop bridge agent, not built" },
          ]),
        };
      }
      return {
        ...m,
        value: p.mixedCurrency ? "Multiple currencies" : formatInrShort(p.dueNext7),
        change: p.overdueCount > 0 ? `${formatInrShort(p.overdue)} overdue` : `${p.billCount} open bills`,
        changeDirection: "flat",
        status: p.overdueCount > 0 ? "negative" : "neutral",
        statusLabel: p.overdueCount > 0 ? "Overdue bills" : "Scheduled",
        comparison: `Due in the next 7 days · ${p.dueNext7Count} bill${p.dueNext7Count === 1 ? "" : "s"} (live)`,
        updated: "Just now",
        evidence: ev("Upcoming payments", "Live from cfo-backend — §57 accounts payable from vendor bills", [
          {
            label: "Total outstanding",
            value: p.totalOutstanding == null ? "Mixed currencies — see breakdown" : formatInrShort(p.totalOutstanding),
          },
          ...p.ageing.map((b) => ({ label: b.label, value: `${formatInrShort(b.amount)} (${b.count})` })),
          ...p.upcoming.slice(0, 5).map((u) => ({
            label: `${u.vendorName} · ${u.billNumber}`,
            value: `${formatInrShort(u.balance)} due ${u.dueDate}`,
          })),
          ...p.warnings.map((w, i) => ({ label: `Caveat ${i + 1}`, value: w })),
        ]),
      };
    }

    // §55 net cash movement. Real bank credits minus debits over the observed
    // window — not revenue minus costs, because §44 makes matched bank credit
    // the cash truth.
    if (m.label === "Burn rate" && liveBurn && liveBurn.transactionCount > 0) {
      const b = liveBurn;
      return {
        ...m,
        // A business taking in more than it spends is not "burning −₹1.4 L".
        value: b.burning ? `${formatInrShort(b.monthlyNetBurn)} / mo` : "Cash positive",
        change: `${formatInrShort(b.netMovement)} net`,
        changeDirection: "flat",
        status: b.burning ? "warning" : "positive",
        statusLabel: b.status,
        comparison: `${b.transactionCount} bank transactions over ${b.observedDays} days`,
        updated: "Just now",
        evidence: ev("Burn rate", "Live from cfo-backend — §55 net cash movement from bank transactions", [
          { label: "Cash in", value: formatInrShort(b.inflow) },
          { label: "Cash out", value: formatInrShort(b.outflow) },
          { label: "Net movement", value: formatInrShort(b.netMovement) },
          { label: "Monthly net burn", value: b.burning ? formatInrShort(b.monthlyNetBurn) : "None — net inflow" },
          { label: "Observed window", value: `${b.observedDays} days, ${b.transactionCount} transactions` },
          ...b.warnings.map((w, i) => ({ label: `Caveat ${i + 1}`, value: w })),
        ]),
      };
    }

    // §85 runway — and the rule that makes this card honest: "only calculate
    // runway when net burn is positive". With net inflow there is nothing to
    // run out of, so this shows why rather than dividing by a negative and
    // rendering a nonsense number.
    if (m.label === "Runway" && liveBurn && liveBurn.transactionCount > 0) {
      const b = liveBurn;
      return {
        ...m,
        value: b.runwayMonths == null ? "Not applicable" : `${b.runwayMonths} months`,
        change: b.runwayMonths == null ? "" : `at ${formatInrShort(b.monthlyNetBurn)}/mo`,
        changeDirection: "flat",
        status: b.runwayMonths == null ? "positive" : b.runwayMonths < 6 ? "negative" : "neutral",
        statusLabel: b.runwayMonths == null ? "No burn" : b.status,
        comparison: b.runwayReason,
        updated: "Just now",
        evidence: ev("Runway", "Live from cfo-backend — §85 available cash ÷ monthly net burn", [
          { label: "Available cash", value: formatInrShort(b.availableCash) },
          { label: "Monthly net burn", value: b.burning ? formatInrShort(b.monthlyNetBurn) : "None — net inflow" },
          { label: "Runway", value: b.runwayMonths == null ? "Not applicable" : `${b.runwayMonths} months` },
          { label: "Why", value: b.runwayReason },
          ...b.warnings.map((w, i) => ({ label: `Caveat ${i + 1}`, value: w })),
        ]),
      };
    }

    // §36/§37 contribution margin. The card shows CM3 (after ads) because
    // that's the number a founder means by "contribution margin" — but it is
    // only presented as a margin when the backend says the layers behind it are
    // reliable. When they aren't, the card refuses to show a percentage at all
    // and says which layer is missing instead: an unreliable 87% margin is a
    // far more damaging thing to display than "cost data missing".
    if (m.label === "Contribution margin" && liveContribution) {
      const c = liveContribution;
      const cm3 = c.levels.cm3;
      const missing = c.layers.filter((l) => !l.hasSource).map((l) => l.label);
      const cogsLayer = c.layers.find((l) => l.key === "cogs");

      if (!cm3.reliable) {
        // CM3 is honest about being unknowable, but CM0 (gross margin after
        // COGS) becomes real the moment costs exist — and hiding a reliable
        // CM0 behind "Not measurable" told the reader margins were unknowable
        // when the biggest cost layer was already measured. The card face
        // shows CM0 clearly named as gross margin; the missing CM3 layers stay
        // in the caveat line.
        const cm0 = c.levels.cm0;
        const blockedEvidence = ev("Contribution margin", "Live from cfo-backend — §36 layered CM, blocked on missing cost inputs", [
          { label: "Net revenue (§11)", value: formatInrShort(c.netRevenue.value) },
          { label: "COGS coverage", value: `${c.cogsCoverage.valueCoveragePct}% of line value (${c.cogsCoverage.costedLines}/${c.cogsCoverage.totalLines} lines)` },
          ...c.layers.map((l) => ({
            label: `${l.label} (${l.spec})`,
            value: l.hasSource ? formatInrShort(l.amount) : "no data source",
          })),
          { label: "Finality (§90)", value: c.status },
          { label: "Why not CM3", value: "A margin computed with cost layers missing overstates profit — see cfo-docs/PROGRESS.md" },
        ]);
        if (cm0?.reliable) {
          return {
            ...m,
            dataStatus: c.dataStatus,
            evidenceKey: "contribution_margin",
            value: `${cm0.marginPct}%`,
            change: formatInrShort(cm0.value),
            changeDirection: "flat",
            status: "warning",
            statusLabel: c.status,
            comparison: `Gross margin (CM0, after COGS only) — full CM blocked: ${missing.slice(0, 2).join(", ") || "cost layers missing"}`,
            updated: "Just now",
            evidence: blockedEvidence,
          };
        }
        return {
          ...m,
          dataStatus: c.dataStatus,
          evidenceKey: "contribution_margin",
          value: "Not measurable",
          change: `${c.dataCompleteness}% of inputs`,
          changeDirection: "flat",
          status: "warning",
          statusLabel: c.status,
          comparison:
            c.cogsCoverage.totalLines > 0 && c.cogsCoverage.valueCoveragePct < 95
              ? `Product cost missing for ${100 - c.cogsCoverage.valueCoveragePct}% of order value`
              : `Missing cost layers: ${missing.slice(0, 2).join(", ")}`,
          updated: "Just now",
          evidence: blockedEvidence,
        };
      }

      return {
        ...m,
        dataStatus: c.dataStatus,
        evidenceKey: "contribution_margin",
        value: `${cm3.marginPct}%`,
        change: formatInrShort(cm3.value),
        changeDirection: "flat",
        status: cm3.marginPct >= 20 ? "positive" : "warning",
        statusLabel: c.status,
        comparison: `CM3 — after COGS, fulfilment, fees and ads (${c.dataCompleteness}% complete)`,
        updated: "Just now",
        evidence: ev("Contribution margin", "Live from cfo-backend — §36 layered contribution margin", [
          { label: "Net revenue (§11)", value: formatInrShort(c.netRevenue.value) },
          { label: "CM0 — after COGS", value: `${formatInrShort(c.levels.cm0.value)} (${c.levels.cm0.marginPct}%)` },
          { label: "CM1 — after fulfilment", value: `${formatInrShort(c.levels.cm1.value)} (${c.levels.cm1.marginPct}%)` },
          { label: "CM2 — after fees", value: `${formatInrShort(c.levels.cm2.value)} (${c.levels.cm2.marginPct}%)` },
          { label: "CM3 — after ads", value: `${formatInrShort(cm3.value)} (${cm3.marginPct}%)` },
          { label: "COGS (§19)", value: formatInrShort(cogsLayer?.amount ?? 0) },
          { label: "Finality (§90)", value: c.status },
        ]),
      };
    }

    // Same endpoint the Inventory page already uses. Note the mock card this
    // replaces claimed "landed cost" — the endpoint values stock at RETAIL
    // price × quantity, because no cost basis exists anywhere in the schema
    // (ProductVariant has `price` and no cost field; OrderLineItem.cogsAmount
    // is nullable and nothing populates it). Those are very different numbers,
    // so the card says "at retail price" and the evidence row says why. Fixing
    // the basis means getting cost data in, not relabelling this.
    if (m.label === "Inventory value" && liveInventoryValue && liveInventoryValue.variantCount > 0) {
      return {
        ...m,
        value: formatInrShort(liveInventoryValue.value),
        change: `${liveInventoryValue.unitsOnHand.toLocaleString("en-IN")} units`,
        changeDirection: "flat",
        status: "neutral",
        statusLabel: "At retail price",
        // "as of now" regardless of the date filter — this metric can't be
        // historical (see the periodFiltered: false note in the backend's
        // modules/calc/inventory.ts), so the card must not imply otherwise.
        comparison: `${liveInventoryValue.variantCount.toLocaleString("en-IN")} variants on hand — as of now (live)`,
        updated: "Just now",
        evidence: ev("Inventory value", "Live from cfo-backend — Shopify stock on hand", [
          { label: "Stock value (retail)", value: formatInrShort(liveInventoryValue.value) },
          { label: "Units on hand", value: liveInventoryValue.unitsOnHand.toLocaleString("en-IN") },
          { label: "Variants counted", value: liveInventoryValue.variantCount.toLocaleString("en-IN") },
          { label: "Basis", value: "Retail price × quantity — no cost data available yet" },
          { label: "Formula version", value: liveInventoryValue.formulaVersion },
        ]),
      };
    }

    if (m.label === "Orders (MTD)" && salesHasOrders) {
      const pct = liveSales.orders.changePct;
      return {
        ...m,
        value: liveSales.orders.value.toLocaleString("en-IN"),
        change: pct == null ? "No prior data" : `${pct >= 0 ? "+" : ""}${pct}%`,
        changeDirection: pct == null ? "flat" : pct >= 0 ? "up" : "down",
        comparison: comparisonLabel(liveSales.comparison),
        updated: "Just now",
        evidence: ev("Orders", "Live from cfo-backend — orders placed month to date", [
          { label: "Orders (MTD)", value: liveSales.orders.value.toLocaleString("en-IN") },
          { label: "Same period last month", value: liveSales.orders.priorValue.toLocaleString("en-IN") },
          { label: "Gross sales (MTD)", value: formatInrShort(liveSales.grossSales.value) },
          { label: "Formula version", value: liveSales.formulaVersion },
        ]),
      };
    }

    if (m.label === "Average order value" && salesHasOrders && liveSales.averageOrderValue.value != null) {
      const pct = liveSales.averageOrderValue.changePct;
      return {
        ...m,
        value: formatInrShort(liveSales.averageOrderValue.value),
        change: pct == null ? "No prior data" : `${pct >= 0 ? "+" : ""}${pct}%`,
        changeDirection: pct == null ? "flat" : pct >= 0 ? "up" : "down",
        comparison: comparisonLabel(liveSales.comparison),
        updated: "Just now",
        evidence: ev("Average order value", "Live from cfo-backend — gross sales ÷ orders", [
          { label: "Gross sales (MTD)", value: formatInrShort(liveSales.grossSales.value) },
          { label: "Orders (MTD)", value: String(liveSales.orders.value) },
          { label: "AOV", value: formatInrShort(liveSales.averageOrderValue.value) },
          {
            label: "AOV last month",
            value:
              liveSales.averageOrderValue.priorValue == null
                ? "—"
                : formatInrShort(liveSales.averageOrderValue.priorValue),
          },
          { label: "Formula version", value: liveSales.formulaVersion },
        ]),
      };
    }

    // Spec §66 revenue refund rate: refunded value ÷ tax-exclusive revenue.
    // This is now a real measurement rather than the floor the old version
    // reported — refund amounts are stored per order, so partial refunds count
    // properly and nothing has to be excluded for being unreadable. The
    // remaining caveat is the denominator: §66 wants delivered orders, and
    // delivery data doesn't exist, so it's recognised orders instead.
    if (m.label === "Refund rate" && salesHasOrders && liveSales.refunds.ratePct != null) {
      const r = liveSales.refunds;
      return {
        ...m,
        value: `${r.ratePct}%`,
        change: `${r.orderRatePct ?? "—"}% of orders`,
        changeDirection: "flat",
        status: r.ratePct > 5 ? "warning" : "neutral",
        statusLabel: "Measured",
        comparison: comparisonLabel(liveSales.comparison),
        updated: "Just now",
        evidence: ev("Refund rate", "Live from cfo-backend — §66, by value and by order count", [
          { label: "Refunded (cash)", value: formatInrShort(r.refundedValue) },
          { label: "Refunded (ex GST)", value: formatInrShort(r.refundedExGst) },
          { label: "Orders with a refund", value: String(r.ordersWithRefund) },
          { label: "Revenue refund rate", value: `${r.ratePct}%` },
          { label: "Order refund rate", value: `${r.orderRatePct ?? "—"}%` },
          { label: "Denominator", value: r.denominatorDeviation ?? r.denominator },
          { label: "Formula version", value: liveSales.formulaVersion },
        ]),
      };
    }

    // Pipeline health, not a business number. A webhook-fed connector can be
    // completely current and still show as stale here, because lastSyncedAt
    // only moves when a full sync job finishes and there's no scheduler yet —
    // so the evidence drawer spells that out instead of implying data loss.
    if (m.label === "Data freshness" && liveFreshness && liveFreshness.totalSources > 0) {
      const f = liveFreshness;
      const allFresh = f.staleSources === 0 && f.erroredSources === 0;
      const ageLabel =
        f.newestAgeMinutes == null
          ? "Never synced"
          : f.newestAgeMinutes < 60
            ? `${f.newestAgeMinutes} min ago`
            : `${Math.round(f.newestAgeMinutes / 60)} h ago`;
      return {
        ...m,
        value: `${f.freshSources}/${f.totalSources} sources`,
        change: allFresh ? "All synced" : `${f.staleSources} stale`,
        changeDirection: "flat",
        status: f.erroredSources > 0 ? "negative" : allFresh ? "positive" : "warning",
        statusLabel: f.erroredSources > 0 ? "Sync errors" : allFresh ? "Fresh" : "Stale",
        comparison: `Most recent sync ${ageLabel}`,
        updated: "Just now",
        evidence: ev("Data freshness", "Live from cfo-backend — last completed sync per connection", [
          ...f.sources
            .filter((s) => s.status === "ACTIVE")
            .map((s) => ({
              label: s.provider,
              value: s.lastSyncError
                ? `Error — ${s.lastSyncError}`
                : s.ageMinutes == null
                  ? "Never synced"
                  : s.ageMinutes < 60
                    ? `${s.ageMinutes} min ago`
                    : `${Math.round(s.ageMinutes / 60)} h ago`,
            })),
          { label: "Stale after", value: `${Math.round(f.staleAfterMinutes / 60)} h` },
          { label: "Note", value: "Webhook deliveries don't advance this — it tracks full syncs, which now run on a schedule" },
        ]),
      };
    }

    // ROAS = net revenue ÷ ad spend, blended (no per-ad attribution exists —
    // see modules/calc/ads.ts). Null when spend is zero, or when the ad
    // account bills in a non-INR currency that can't be compared to
    // rupee-denominated revenue without an FX rate.
    if (m.label === "Marketing efficiency (ROAS)" && liveAdEfficiency && liveAdEfficiency.roas != null) {
      return {
        ...m,
        value: `${liveAdEfficiency.roas}x`,
        change: `CAC ${formatInrShort(liveAdEfficiency.blendedCac)}`,
        changeDirection: "flat",
        status: liveAdEfficiency.roas >= 2 ? "positive" : "warning",
        statusLabel: liveAdEfficiency.roas >= 2 ? "Healthy" : "Watch",
        comparison: `Blended, ${datePreset.toLowerCase()} (live)`,
        updated: "Just now",
        evidence: ev("Marketing efficiency (ROAS)", "Live from cfo-backend — real revenue ÷ real ad spend", [
          { label: "Net revenue (MTD)", value: formatInrShort(liveAdEfficiency.netRevenue) },
          { label: "Ad spend (MTD)", value: formatInrShort(liveAdEfficiency.adSpend) },
          { label: "Blended ROAS", value: `${liveAdEfficiency.roas}x` },
          { label: "Orders (MTD)", value: String(liveAdEfficiency.orderCount) },
          { label: "Blended CAC", value: formatInrShort(liveAdEfficiency.blendedCac) },
          { label: "Attribution", value: "Blended — no per-ad attribution model" },
          { label: "Formula version", value: liveAdEfficiency.formulaVersion },
        ]),
      };
    }

    // Real Meta Ads + Google Ads spend. dayCount === 0 means no ads
    // connector has actually pulled anything yet, so the mock card stays —
    // an empty "₹0" would read as "you spent nothing", not "not connected".
    if (m.label === "Ad spend (MTD)" && liveAdSpend && liveAdSpend.dayCount > 0) {
      const changeDirection = liveAdSpend.changePct == null ? "flat" : liveAdSpend.changePct >= 0 ? "up" : "down";
      const changeLabel =
        liveAdSpend.changePct == null ? "No prior data" : `${liveAdSpend.changePct >= 0 ? "+" : ""}${liveAdSpend.changePct}%`;
      const perProvider = liveAdSpend.byProvider.map((p) => ({
        label: p.provider === "META_ADS" ? "Meta Ads" : "Google Ads",
        value: p.value == null ? `${p.currency ?? "mixed"} — see breakdown` : formatInrShort(p.value),
      }));

      // Spend across differently-billed ad accounts can't be summed into one
      // rupee figure without an FX rate the backend doesn't have, so it
      // reports value: null and we say so rather than inventing a total.
      if (liveAdSpend.mixedCurrency) {
        return {
          ...m,
          value: "Multiple currencies",
          change: "Can't total",
          changeDirection: "flat",
          status: "warning",
          statusLabel: "Mixed currency",
          comparison: "ad accounts bill in different currencies",
          updated: "Just now",
          evidence: ev("Ad spend", "Live from cfo-backend — Meta + Google Ads", [
            ...Object.entries(liveAdSpend.byCurrency).map(([code, minor]) => ({
              label: code,
              value: `${code} ${(Number(minor) / 100).toLocaleString("en-IN")}`,
            })),
            ...perProvider,
            { label: "Why no total", value: "Converting needs a historical FX rate this system doesn't have" },
            { label: "Formula version", value: liveAdSpend.formulaVersion },
          ]),
        };
      }

      return {
        ...m,
        value: formatInrShort(liveAdSpend.value),
        change: changeLabel,
        changeDirection,
        comparison: comparisonLabel(liveAdSpend.comparison),
        updated: "Just now",
        evidence: ev("Ad spend", "Live from cfo-backend — Meta + Google Ads, real spend", [
          { label: "Ad spend (MTD)", value: formatInrShort(liveAdSpend.value) },
          { label: "Same period last month", value: formatInrShort(liveAdSpend.priorValue) },
          ...perProvider,
          { label: "Impressions", value: liveAdSpend.impressions.toLocaleString("en-IN") },
          { label: "Clicks", value: liveAdSpend.clicks.toLocaleString("en-IN") },
          { label: "Formula version", value: liveAdSpend.formulaVersion },
        ]),
      };
    }

    if (m.label === "Available cash" && liveAvailableCash && liveAvailableCash.connections.length > 0) {
      const changeDirection = liveAvailableCash.changePct == null ? "flat" : liveAvailableCash.changePct >= 0 ? "up" : "down";
      const changeLabel =
        liveAvailableCash.changePct == null
          ? liveAvailableCash.priorComplete === false
            ? "Comparison unavailable"
            : "No prior data"
          : `${liveAvailableCash.changePct >= 0 ? "+" : ""}${liveAvailableCash.changePct}%`;
      const evidenceRows = liveAvailableCash.connections.map((c) => ({ label: c.label, value: formatInrShort(c.balance) }));
      evidenceRows.push({ label: "As of", value: new Date(liveAvailableCash.asOf).toLocaleString() });
      if (liveAvailableCash.missingOpeningBalance.length > 0) {
        evidenceRows.push({
          label: "Excluded (no opening balance set)",
          value: liveAvailableCash.missingOpeningBalance.map((c) => c.label).join(", "),
        });
      }
      return {
        ...m,
        value: formatInrShort(liveAvailableCash.value),
        change: changeLabel,
        changeDirection,
        comparison: "vs 30 days ago (live, bank accounts only)",
        updated: "Just now",
        evidence: ev("Available cash", "Live from cfo-backend — bank account balances only, not gateway-reported balances", evidenceRows),
      };
    }

    if (m.label === "Cash received (MTD)" && liveCash) {
      const changeDirection = liveCash.changePct == null ? "flat" : liveCash.changePct >= 0 ? "up" : "down";
      const changeLabel =
        liveCash.changePct == null ? "No prior data" : `${liveCash.changePct >= 0 ? "+" : ""}${liveCash.changePct}%`;
      return {
        ...m,
        dataStatus: liveCash.dataStatus,
        evidenceKey: "cash_received",
        value: formatInrShort(liveCash.value),
        change: changeLabel,
        changeDirection,
        comparison: comparisonLabel(liveCash.comparison),
        updated: "Just now",
        evidence: ev("Cash received", "Live from cfo-backend — real bank-credit transactions, not mock data", [
          { label: "Cash received (MTD)", value: formatInrShort(liveCash.value) },
          { label: "Same period last month", value: formatInrShort(liveCash.priorValue) },
          { label: "Credit transactions counted", value: String(liveCash.transactionCount) },
          { label: "Formula version", value: liveCash.formulaVersion },
        ]),
      };
    }

    if (m.label === "RTO rate" && liveRto && liveRto.rtoRatePct != null) {
      const delta =
        liveRto.changePct == null ? null : Math.round(liveRto.changePct * 10) / 10;
      const changeDirection = delta == null ? "flat" : delta >= 0 ? "up" : "down";
      const changeLabel = delta == null ? "No prior data" : `${delta >= 0 ? "+" : ""}${delta}pp`;
      return {
        ...m,
        value: `${liveRto.rtoRatePct}%`,
        change: changeLabel,
        changeDirection,
        goodDirection: "down",
        comparison: comparisonLabel(liveRto.comparison),
        updated: "Just now",
        evidence: ev("RTO rate", "Live from cfo-backend — real Shiprocket shipment data, not mock data", [
          { label: "Dispatched shipments (MTD)", value: String(liveRto.dispatchedCount) },
          { label: "RTO shipments (MTD)", value: String(liveRto.rtoCount) },
          { label: "RTO rate", value: `${liveRto.rtoRatePct}%` },
          { label: "Same period last month", value: liveRto.priorRtoRatePct == null ? "No data" : `${liveRto.priorRtoRatePct}%` },
          { label: "Formula version", value: liveRto.formulaVersion },
        ]),
      };
    }

    // No live branch matched. Previously this returned the card definition
    // itself, which carried a mock value — so an unconnected source, an empty
    // period or an unreachable backend all rendered as confident figures. The
    // card now states that it has no answer and what would give it one.
    //
    // Asked per card, not per page: this card's own request may have failed
    // while the rest of the page loaded perfectly, and "we could not ask" is a
    // different fact from "nothing is connected".
    const failed = cardFailed(m.label);
    return {
      ...m,
      value: "No data",
      change: failed ? "Backend unreachable" : m.needs,
      changeDirection: "flat",
      status: "neutral",
      statusLabel: failed ? "Unavailable" : "Not connected",
      comparison: failed ? "The last request to cfo-backend failed" : m.formula,
      updated: "—",
      evidence: ev(m.label, failed ? "Could not reach cfo-backend" : "No data source connected", [
        { label: "Formula", value: m.formula },
        { label: "Needs", value: m.needs },
        ...(failed
          ? [{ label: "Status", value: "The backend did not respond — this is a connection problem, not a zero" }]
          : [{ label: "Why blank", value: "A figure shown here with no source behind it is one a founder would act on" }]),
      ]),
    };
  };

  const metrics = pinned.map(enrich);
  const heroMetrics = HERO_METRICS.map(enrich);

  return (
    <>
      <TopNav
        title="Overview"
        // Reflects the header's actual selection instead of the old hardcoded
        // "Last 30 days", which contradicted the month-to-date figures below it.
        // The organisation name is the signed-in one, not the invented "Aara
        // Wellness Pvt Ltd" that used to sit here — the same fabrication that
        // was removed from the global header.
        subtitle={`Founder dashboard${organization?.name ? ` · ${organization.name}` : ""} · ${datePreset}`}
        actions={
          <>
            <button className="btn btn-secondary" type="button">Export</button>
            {/* Was a button that rendered and did nothing — the same defect as
                the decorative bell and the "AK" avatar. It now opens the ask
                popup over this page, answered by the real orchestrator. */}
            <AskCfoButton />
          </>
        }
      />

      <div>
        {/* The page used to fail silently here: with cfo-backend unreachable
            every card fell back to mock figures and nothing said so. A dashboard
            that cannot reach its data must lead with that, not bury it. */}
        {liveFailed ? (
          <div
            className="mb-5 rounded-lg border px-4 py-3 text-[13px]"
            style={{
              borderColor: "var(--color-destructive)",
              background: "var(--color-destructive-soft)",
              color: "var(--color-destructive)",
            }}
            role="alert"
          >
            <strong className="font-medium">Couldn&apos;t reach cfo-backend.</strong> Nothing below is live —
            the cards are showing &ldquo;No data&rdquo; because the request failed, not because your business has none.
          </div>
        ) : null}

        <div>
          <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-foreground">Today at a glance</h2>
          <p className="mb-4 mt-0.5 text-[13px] text-muted-foreground">The three numbers that decide this week.</p>
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Per card, not per row: available cash answers in ~50ms while
                contribution margin takes ~230ms, and the fast one has no
                reason to wait. */}
            {heroMetrics.map((m, i) =>
              cardPending(m.label) ? (
                <div key={m.label} className="gcard h-[212px] animate-pulse p-7" role="status" aria-busy="true">
                  <span className="sr-only">Loading {m.label}</span>
                </div>
              ) : (
                <HeroMetric
                  key={m.label}
                  m={m}
                  ink={i === 0}
                  points={heroSeries[m.snapshotKey]}
                  onEvidence={() => openDrawer(m.evidence, m.evidenceKey)}
                />
              )
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-3  mt-10 text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Key metrics</h2>
          <div ref={gridRef} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* One skeleton per pinned card, so the grid keeps its exact shape
                and nothing reflows when the values arrive. Rendered instead of
                the cards — not alongside — because showing mock numbers first
                and swapping them for real ones is precisely the "looks like
                data when it isn't" problem this dashboard has to avoid. */}
            {metrics.map((m, i) =>
              cardPending(m.label) ? (
                <MetricCardSkeleton key={m.label} />
              ) : (
                <MetricCard
                  key={m.label}
                  {...m}
                  badge={<DataStatusBadge dataStatus={m.dataStatus} />}
                  label={forPeriod(m.label, datePreset)}
                  onEvidence={() => openDrawer(m.evidence, m.evidenceKey)}
                  onInfo={() => setInfo(m)}
                  onRemove={() => removeMetric(m.label)}
                  onDragStart={() => setDragLabel(m.label)}
                  onDragEnd={() => setDragLabel(null)}
                  onDragOver={() => reorderTo(i)}
                  isDragging={dragLabel === m.label}
                />
              )
            )}
            <button
              type="button"
              data-flip-key="__add-metric__"
              onClick={() => setPicker(true)}
              className="flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full border border-current">
                <Icon paths={PLUS_PATHS} size={16} />
              </span>
              <span className="text-xs font-medium">Add metric card</span>
            </button>
          </div>
        </div>

        {/* Where the COD cash is — all-time position from /reconciliation/summary.
            72% of this store's orders are COD, and the landing page never said
            what couriers are holding or have gone silent on. The dark bucket is
            the headline: it is the single largest number in the system and has
            nowhere else a founder would stumble onto it. Position, not period —
            deliberately ignores the date filter (a parcel's cash doesn't stop
            existing because it was ordered before the window). */}
        {liveRecon?.codPosition?.hasCourierData ? (
          <div className="mt-10 mb-6">
            <h2 className="mb-3 flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Where the COD cash is <span className="normal-case tracking-normal">· all-time, not period-filtered</span>
              <DataStatusBadge dataStatus={liveRecon.codDataStatus} />
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: "Tracking gone dark",
                  paise: liveRecon.codPosition.unknownValue,
                  count: `${liveRecon.codPosition.unknownCount.toLocaleString("en-IN")} parcels`,
                  sub:
                    liveRecon.codPosition.unknownOldestDays !== null
                      ? `No scan in 30+ days · oldest silent ${liveRecon.codPosition.unknownOldestDays}d — request a COD remittance MIS`
                      : "Every parcel scanned within 30 days",
                  negative: liveRecon.codPosition.unknownCount > 0,
                },
                {
                  label: "Collected, awaiting remittance",
                  paise: liveRecon.codPosition.deliveredValue,
                  count: `${liveRecon.codPosition.deliveredCount.toLocaleString("en-IN")} delivered`,
                  sub: "Cash the courier has already taken at the door",
                },
                {
                  label: "Still in flight",
                  paise: liveRecon.codPosition.inFlightValue,
                  count: `${liveRecon.codPosition.inFlightCount.toLocaleString("en-IN")} orders`,
                  sub: "Moving normally — not owed to you yet",
                },
                {
                  label: "RTO — never collected",
                  paise: liveRecon.codPosition.rtoValue,
                  count: `${liveRecon.codPosition.rtoCount.toLocaleString("en-IN")} returned`,
                  sub: "Came back undelivered; this cash never existed",
                },
              ].map((t) => (
                <a
                  key={t.label}
                  href="/reconciliation"
                  className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary"
                >
                  <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{t.label}</span>
                  <span
                    className="text-xl font-semibold"
                    style={t.negative ? { color: "var(--color-destructive)" } : undefined}
                  >
                    {/* Paise string → whole rupees without a float: drop the
                        last two digits, then format. */}
                    {formatInrShort(Number(t.paise.length > 2 ? t.paise.slice(0, -2) : "0"))}
                  </span>
                  <span className="text-[12.5px] text-muted-foreground">{t.count}</span>
                  <span className="text-[12px] text-muted-foreground">{t.sub}</span>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {picker && (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-scrim p-4"
            onClick={() => setPicker(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-raised"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Add a key metric</div>
                  <p className="text-xs text-muted-foreground">Pick a metric to pin to your overview.</p>
                </div>
                <button type="button" onClick={() => setPicker(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                  ✕
                </button>
              </div>
              <div className="mt-4 max-h-72 space-y-1 overflow-y-auto">
                {available.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">All available metrics are already on your dashboard.</p>
                )}
                {available.map((m) => (
                  <button
                    key={m.label}
                    type="button"
                    onClick={() => addMetric(m)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-foreground">{m.label}</span>
                      {m.comparison && <span className="block truncate text-xs text-muted-foreground">{m.comparison}</span>}
                    </span>
                    <Icon paths={PLUS_PATHS} size={16} className="shrink-0 text-primary" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {info && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-scrim p-4" onClick={() => setInfo(null)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-raised">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium">{info.label}</div>
                <button type="button" onClick={() => setInfo(null)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                  ✕
                </button>
              </div>
              <div className="mt-3 text-2xl text-foreground">{info.value}</div>
              {info.comparison && <p className="mt-2 text-xs text-muted-foreground">{info.comparison}</p>}
              <dl className="mt-4 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd><StatusBadge status={info.status || "positive"} label={info.statusLabel || "On track"} /></dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Change</dt>
                  <dd className="text-foreground">{info.change || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Last updated</dt>
                  <dd className="text-foreground">{info.updated}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {/* Live: §11 net revenue against §44 matched bank credit, both from
                the same trailing-6-month series the Revenue page uses — and
                zoomable, so pinching in re-cuts the same orders into weeks and
                then days without ever changing what they sum to. */}
            <RevenueTrendChart
              title="Net revenue vs cash received"
              subtitle="Trailing 6 months · live"
              initialTrend={liveLadder?.trend ?? null}
              initialWindow={liveLadder?.trendWindow ?? null}
              loading={pending.has("ladder")}
              footnote="Revenue is recognised at order placement (§8); cash is matched bank credit (§44). The gap is settlement lag."
            />
          </div>
          {/* Costs now exist (estimated), so the blocker is no longer cost
              entry — it's that margins are computed on demand and no daily
              series is stored yet. Saying "needs product costs" here after
              741 SKUs were costed would send the user to fix a solved problem. */}
          <NoDataPanel
            term="chart-margin-trend"
            title="Contribution margin trend"
            reason="No historical margin series is stored yet — margin is computed on demand for the selected period, so there is nothing to plot over time. Turns on once daily metric snapshots are written."
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* §83 requires a deterministic forecast from confirmed and probable
              flows, each labelled CONFIRMED / HIGH_CONFIDENCE / MODELLED /
              USER_ASSUMPTION (§84). Extrapolating a line from 19 bank rows
              would be a guess wearing a forecast's clothes. */}
          <NoDataPanel
            term="chart-cash-forecast"
            title="30-day cash forecast"
            reason="Needs scheduled inflows and outflows with confidence labels (§83/§84). Not built yet."
          />
          {/* Live, but honestly renamed: this is net revenue by channel, not
              channel PROFITABILITY — profit per channel needs COGS and
              per-channel cost allocation. */}
          {/* FinancialChart takes no loading prop, and an empty series draws a
              blank chart that reads as "this store sells through no channels"
              — so while the ladder is in flight the card is a skeleton rather
              than a chart of nothing. */}
          {pending.has("ladder") ? (
            <div className="gcard h-[336px] animate-pulse p-5" role="status" aria-busy="true">
              <span className="sr-only">Loading net revenue by channel</span>
            </div>
          ) : (
          <FinancialChart
            title="Net revenue by channel"
            subtitle={`${datePreset} · live`}
            kind="bar"
            series={channelSeries}
            yFormat="currency"
            showLegend={false}
            footnote="Not channel profitability — that needs COGS and per-channel cost allocation."
          />
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* §40. Ranked by CM0 once costs exist; by revenue until then, with
              the heading saying which — a "most profitable" list built from
              revenue alone would put the highest-turnover loss-maker at the top.
              The subtitle names the PERIOD too, not just the ranking basis: nine
              products totalling ₹11.8 K reads as broken until you can see it is
              answering for a single morning, which is exactly how a correct
              number ends up reported as a bug. */}
          {/* Title and subtitle sit outside the `loading` prop, so while the
              request is in flight the fallback copy would tell the reader to
              add product costs they may already have. */}
          <LiveProductTable
            title={
              pending.has("products") || liveProducts?.canRankByMargin
                ? "Top products by contribution"
                : "Top products by revenue"
            }
            subtitle={
              pending.has("products")
                ? `${datePreset} · live`
                : liveProducts?.canRankByMargin
                  ? `${datePreset} · CM0 — net revenue less product cost (§40)`
                  : `${datePreset} · ranked by net revenue — add product costs to rank by profit`
            }
            rows={liveProducts?.canRankByMargin ? liveProducts.topByMargin : (liveProducts?.topByRevenue ?? [])}
            loading={pending.has("products")}
            footnote={
              liveProducts
                ? `Net revenue is line value less discount, GST and returns (§11), using the figures Shopify states per line rather than a share of the order total.${
                    liveProducts.warnings?.length ? ` ${liveProducts.warnings.join(" ")}` : ""
                  }`
                : null
            }
          />
          {/* Pending is its own branch: while the request is in flight the
              panel below would say costs are missing, which is a statement
              about the data rather than about the wait. */}
          {pending.has("products") ? (
            <LiveProductTable
              title="Loss-making products"
              subtitle={`${datePreset} · negative CM0 — selling below product cost (§40)`}
              rows={[]}
              loading
            />
          ) : liveProducts?.canRankByMargin && liveProducts.bottomByMargin.length > 0 ? (
            <LiveProductTable
              title="Loss-making products"
              subtitle={`${datePreset} · negative CM0 — selling below product cost (§40)`}
              rows={liveProducts.bottomByMargin}
              loading={false}
            />
          ) : (
            <NoDataPanel
              title="Loss-making products"
              reason={
                liveProducts?.canRankByMargin
                  ? "No product is currently selling below its cost."
                  : "Needs product costs — a loss can't be detected without knowing what things cost."
              }
              action={liveProducts?.canRankByMargin ? null : "Add costs"}
              href="/costs"
            />
          )}
        </div>

        <div className="mt-4">
          {/* §45 needs Settlement rows. Measured: zero for this organisation. */}
          <NoDataPanel
            title="Settlement ageing"
            reason="No settlement records. Connect Razorpay or a marketplace to age pending payouts (§45)."
            action="Connections"
            href="/connections"
          />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Important anomalies</h2>
            <div className="grid gap-3">
              {anyPending(ANOMALY_SOURCES) ? (
                <div className="gcard h-24 animate-pulse p-5" />
              ) : anomalies.length > 0 ? (
                anomalies.map((a) => (
                  <AlertCard key={a.id} severity={a.severity} title={a.title} description={a.description} meta={a.meta} actionLabel="View details" />
                ))
              ) : (
                <div className="gcard p-5 text-sm text-muted-foreground">
                  No anomalies detected against the rules currently implemented (§98). Detection is limited by what&apos;s
                  connected — missing cost, settlement and fee data mean whole classes of anomaly can&apos;t be seen yet.
                </div>
              )}
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Recommended actions</h2>
            <div className="grid gap-3">
              {anyPending(ACTION_SOURCES) ? (
                <div className="gcard h-24 animate-pulse p-5" />
              ) : actions.length > 0 ? (
                actions.map((a) => (
                  <Link key={a.id} href={a.href} className="block">
                    <AlertCard severity="info" title={a.title} description={a.description} meta={a.meta} actionLabel="Go" />
                  </Link>
                ))
              ) : (
                <div className="gcard p-5 text-sm text-muted-foreground">Nothing outstanding.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <EvidenceDrawer
        open={drawer.open}
        title={drawer.title}
        sourceLabel={drawer.sourceLabel}
        rows={drawer.rows}
        onClose={closeDrawer}
        onDownload={
          drawer.evidenceKey
            ? async () => {
                const token = await getToken();
                await downloadEvidenceCsv(token, drawer.evidenceKey, dateQuery);
              }
            : null
        }
      />
    </>
  );
}
