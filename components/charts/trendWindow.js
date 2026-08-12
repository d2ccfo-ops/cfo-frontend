import { toIsoDate } from "@/components/controls/DateRangeContext";

// Client-side window arithmetic for the zoomable trend chart.
//
// Deliberately NOT the granularity decision — that belongs to the server
// (cfo-backend/src/lib/trendWindow.ts), which owns the bucket boundaries and
// the labels. The client only ever says "show me this span"; if it also chose
// the bucket size, a gesture could produce a granularity the returned buckets
// don't match, and the axis would start lying about what each point covers.

export const DAY_MS = 86_400_000;

// Mirrors MIN_SPAN_DAYS / MAX_SPAN_DAYS on the server. Kept in sync by the
// server sending them back in `window` — see clampSpan's callers, which prefer
// the served values and fall back to these only before the first response.
export const MIN_SPAN_DAYS = 7;
export const MAX_SPAN_DAYS = 730;

// One notch of a wheel/pinch. 0.8 in, 1.25 out — reciprocal, so zooming in and
// straight back out returns to the exact span you started from rather than
// drifting a few days each round trip.
export const ZOOM_IN = 0.8;
export const ZOOM_OUT = 1.25;

export function clampWindow(fromMs, toMs, { nowMs, minSpanDays = MIN_SPAN_DAYS, maxSpanDays = MAX_SPAN_DAYS }) {
  const minSpan = minSpanDays * DAY_MS;
  const maxSpan = maxSpanDays * DAY_MS;

  let from = fromMs;
  let to = toMs;

  // Span first, anchored on the end — the right-hand edge is "now" in the
  // common case and is the edge people track.
  let span = Math.max(minSpan, Math.min(maxSpan, to - from));
  from = to - span;

  // The future holds no orders. Sliding past today would append a run of empty
  // buckets that look like a collapse in revenue.
  if (to > nowMs) {
    const overshoot = to - nowMs;
    to -= overshoot;
    from -= overshoot;
  }

  return { fromMs: from, toMs: to };
}

// Zoom about a fixed point: the date under the cursor stays put while the
// window contracts around it. Zooming about the centre instead makes the point
// you are pointing at slide away, which is the single most common way a zoom
// control feels broken.
export function zoomAround(fromMs, toMs, anchorFraction, factor, limits) {
  const span = toMs - fromMs;
  const p = Math.min(1, Math.max(0, anchorFraction));
  const anchor = fromMs + span * p;
  const nextSpan = span * factor;
  // The anchor keeps the same fractional position in the new window, which is
  // what makes it appear to stay still.
  const from = anchor - nextSpan * p;
  return clampWindow(from, from + nextSpan, limits);
}

// Shift by a fraction of the current span. Positive moves forward in time.
export function panBy(fromMs, toMs, fraction, limits) {
  const delta = (toMs - fromMs) * fraction;
  return clampWindow(fromMs + delta, toMs + delta, limits);
}

export function windowQuery(fromMs, toMs) {
  return `?from=${toIsoDate(new Date(fromMs))}&to=${toIsoDate(new Date(toMs))}`;
}

export function spanDays(fromMs, toMs) {
  return Math.max(1, Math.round((toMs - fromMs) / DAY_MS));
}

// The default the chart opens on and returns to: the trailing six months, which
// is what the server serves when it is sent no window at all.
export function defaultWindow(now = new Date()) {
  const to = now.getTime();
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  return { fromMs: start.getTime(), toMs: to };
}

// "6 months", "12 weeks", "31 days" — the span, said the way the person who
// just pinched would say it.
export function describeSpan(fromMs, toMs) {
  const days = spanDays(fromMs, toMs);
  if (days >= 60) {
    const months = Math.round(days / 30.44);
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  if (days >= 21) {
    const weeks = Math.round(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"}`;
  }
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function describeRange(fromMs, toMs) {
  const opts = { day: "numeric", month: "short", year: "2-digit" };
  return `${new Date(fromMs).toLocaleDateString("en-IN", opts)} – ${new Date(toMs).toLocaleDateString("en-IN", opts)}`;
}
