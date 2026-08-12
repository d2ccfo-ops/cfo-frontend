"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FinancialChart from "./FinancialChart";
import useChartZoom from "./useChartZoom";
import {
  MAX_SPAN_DAYS,
  MIN_SPAN_DAYS,
  ZOOM_IN,
  ZOOM_OUT,
  describeRange,
  describeSpan,
  panBy,
  spanDays,
  windowQuery,
  zoomAround,
} from "./trendWindow";

// The zoomable net-revenue trend.
//
// Pinching in re-buckets the SAME orders from months to weeks to days; it does
// not fetch a different metric, and the server guarantees the totals survive
// the re-bucketing (cfo-backend/scripts/checkRevenueTrend.ts asserts that the
// daily points inside a month sum to that month exactly). Without that
// guarantee a zoom gesture would be a way to get two different answers to one
// question, which is the failure §1 of the finance engine exists to prevent.
//
// The chart opens on the trailing six months it always showed, and the first
// paint uses the series that already rides along with /metrics/revenue-ladder —
// so zooming costs a request but arriving does not.

const GRANULARITY_LABEL = { day: "daily", week: "weekly", month: "monthly" };

// Gestures fire dozens of events. The window updates immediately (so the
// controls stay responsive and the gesture feels attached to the finger) and
// the fetch trails behind it.
const REFETCH_DEBOUNCE_MS = 220;

function ZoomButton({ onClick, disabled, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export default function RevenueTrendChart({
  title,
  subtitle,
  footnote = "",
  showCashSeries = true,
  // The trailing-6-month series that came with /metrics/revenue-ladder, used
  // for the first paint so arriving on the page costs no extra request.
  initialTrend = null,
  initialWindow = null,
  loading = false,
  height = 240,
}) {
  const { getToken } = useAuth();

  // null means "the server's default window" — the state only becomes explicit
  // once someone actually zooms, so an untouched chart sends no parameters and
  // gets exactly what it always got.
  const [windowState, setWindowState] = useState(null);
  const [zoomed, setZoomed] = useState(null); // { trend, window, cashCoverage }
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const trend = zoomed?.trend ?? initialTrend;
  const served = zoomed?.window ?? initialWindow;
  const granularity = served?.granularity ?? "month";

  // The window the CONTROLS reflect. Before the first zoom this is derived from
  // whatever the server served, so the readout says "6 months" rather than
  // guessing — and it is null until something has been served, because a made-up
  // window under the buttons would be a number nobody measured.
  const servedFrom = served?.from ?? null;
  const servedTo = served?.to ?? null;
  const current = useMemo(() => {
    if (windowState) return windowState;
    if (!servedFrom || !servedTo) return null;
    return { fromMs: new Date(servedFrom).getTime(), toMs: new Date(servedTo).getTime() };
  }, [windowState, servedFrom, servedTo]);

  // Kept in refs so the gesture callbacks stay stable across renders — the
  // wheel listener is bound to their identity, and a callback that changed
  // every render would tear the listener down mid-pinch. Written in an effect
  // rather than during render, which React forbids.
  const currentRef = useRef(current);
  const boundsRef = useRef({ minSpanDays: MIN_SPAN_DAYS, maxSpanDays: MAX_SPAN_DAYS });
  const minSpanDays = served?.minSpanDays ?? MIN_SPAN_DAYS;
  const maxSpanDays = served?.maxSpanDays ?? MAX_SPAN_DAYS;
  useEffect(() => {
    currentRef.current = current;
    boundsRef.current = { minSpanDays, maxSpanDays };
  }, [current, minSpanDays, maxSpanDays]);

  // `factor` is a multiplier on the current span: 0.8 shows 20% less time. The
  // gesture supplies its own factor from the size of the pinch, so the window
  // tracks the fingers; the buttons pass the fixed ZOOM_IN/ZOOM_OUT steps.
  //
  // `now` is read HERE and not in the render body: Date.now() during render is
  // impure (react-hooks/purity), and it would also mean two controls in one
  // paint could clamp against two different "nows".
  const applyZoom = useCallback((factor, anchorFraction) => {
    const window = currentRef.current;
    if (!window) return;
    const limits = { ...boundsRef.current, nowMs: Date.now() };
    setWindowState(zoomAround(window.fromMs, window.toMs, anchorFraction, factor, limits));
  }, []);

  const applyPan = useCallback((direction) => {
    const window = currentRef.current;
    if (!window) return;
    setWindowState(panBy(window.fromMs, window.toMs, direction * 0.15, { ...boundsRef.current, nowMs: Date.now() }));
  }, []);

  const plotRef = useChartZoom({ onZoom: applyZoom, onPan: applyPan });

  // Refetch when the window changes. Debounced, and every in-flight response is
  // checked against the window that is current when it lands — a slow request
  // for a window the user has already zoomed past must not overwrite a newer
  // one, or the chart settles on a window nobody asked for.
  useEffect(() => {
    if (windowState === null) return undefined;
    let cancelled = false;
    const query = windowQuery(windowState.fromMs, windowState.toMs);

    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const token = await getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/metrics/revenue-trend${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        setFailed(false);
        setZoomed(json);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, REFETCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [windowState, getToken]);

  const series = trend
    ? [
        { name: "Net revenue", colorRole: "neutral", points: trend.map((t) => ({ x: t.label, y: t.netRevenue })) },
        ...(showCashSeries
          ? [{ name: "Cash received", colorRole: "accent", points: trend.map((t) => ({ x: t.label, y: t.cashReceived })) }]
          : []),
      ]
    : [];

  const days = current ? spanDays(current.fromMs, current.toMs) : null;
  const atMinSpan = days === null || days <= (served?.minSpanDays ?? MIN_SPAN_DAYS);
  const atMaxSpan = days === null || days >= (served?.maxSpanDays ?? MAX_SPAN_DAYS);

  // Mid-gesture the window has already moved but the buckets have not — the
  // line on screen is still the last one served. Saying "45 days · monthly"
  // during that gap would name a bucket size that nothing on screen uses, so
  // the granularity is only claimed once the served window agrees with the one
  // the controls are showing.
  const servedDays = served ? spanDays(new Date(served.from).getTime(), new Date(served.to).getTime()) : null;
  const bucketsMatchWindow = days !== null && servedDays !== null && Math.abs(days - servedDays) <= 1;
  const granularityLabel = bucketsMatchWindow ? GRANULARITY_LABEL[granularity] : "re-cutting…";

  // The subtitle has to state the window, because after a zoom the chart is no
  // longer showing the six months the caller's static subtitle claims.
  const windowLabel =
    windowState === null || !current
      ? subtitle
      : `${describeRange(current.fromMs, current.toMs)} · ${bucketsMatchWindow ? `${GRANULARITY_LABEL[granularity]} buckets` : "re-cutting buckets…"}`;

  const controls = (
    <div className="flex items-center gap-1.5">
      <span className="mr-1 text-[11px] tabular-nums text-muted-foreground">
        {current ? `${describeSpan(current.fromMs, current.toMs)} · ${granularityLabel}` : "—"}
      </span>
      <ZoomButton onClick={() => applyPan(-1)} disabled={!current} label="Pan back">‹</ZoomButton>
      <ZoomButton onClick={() => applyZoom(ZOOM_OUT, 0.5)} disabled={atMaxSpan} label="Zoom out">−</ZoomButton>
      <ZoomButton onClick={() => applyZoom(ZOOM_IN, 0.5)} disabled={atMinSpan} label="Zoom in">+</ZoomButton>
      <ZoomButton onClick={() => applyPan(1)} disabled={!current} label="Pan forward">›</ZoomButton>
      {windowState !== null ? (
        <button
          type="button"
          onClick={() => {
            setWindowState(null);
            setZoomed(null);
            setFailed(false);
          }}
          className="ml-0.5 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Reset
        </button>
      ) : null}
    </div>
  );

  // No data yet and nothing failed: a skeleton, never a placeholder line.
  if (loading && !trend) {
    return (
      <div className="gcard flex flex-col p-5">
        <div className="h-4 w-56 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 animate-pulse rounded bg-muted" style={{ height }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FinancialChart
        term="chart-revenue-vs-cash"
        title={title}
        subtitle={windowLabel}
        kind="line"
        series={series}
        height={height}
        yFormat="currency"
        showLegend={showCashSeries}
        controls={controls}
        plotRef={plotRef}
        busy={busy}
        footnote={
          failed
            ? "Couldn't load that window — the line below is still the last one that loaded."
            : `${footnote} Pinch or ⌘-scroll to change the window; the buckets re-cut to days, weeks or months to match.`.trim()
        }
      />
    </div>
  );
}
