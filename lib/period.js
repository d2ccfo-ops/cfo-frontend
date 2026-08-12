// Turning the backend's `window` block into words a reader can check.
//
// Every comparison on this dashboard used to be labelled "vs same period last
// month" and nothing else — no dates. A user asked the obvious question ("does
// it check the same date for the previous month or what?") and the product had
// no answer on screen; the only way to find out was to read dateRange.ts.
//
// Worse, the two windows are not always the same length. A month-to-date on 31
// March is compared against 1–28 February, because February has no 31st. That
// asymmetry is correct and unavoidable, but it must be VISIBLE, which is what
// these helpers exist to make it.

// "2026-07-01" → "1 Jul". Parsed as UTC and formatted as UTC on purpose: the
// backend already resolved these to days on the organisation's calendar, so
// re-interpreting them in the browser's zone would shift them by a day for
// anyone not sitting in IST.
function dayLabel(dayKey, withYear = false) {
  if (!dayKey) return null;
  const d = new Date(`${dayKey}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

// "1 Jul – 10 Jul". Collapses to a single date when the window is one day, and
// carries the year only when the two ends disagree about it — "31 Dec – 1 Jan"
// with no year is the kind of label that gets misread as a 12-month span.
export function formatDayRange(startDay, endDay) {
  if (!startDay || !endDay) return null;
  const crossesYear = startDay.slice(0, 4) !== endDay.slice(0, 4);
  const start = dayLabel(startDay, crossesYear);
  const end = dayLabel(endDay, true);
  if (!start || !end) return null;
  return startDay === endDay ? end : `${start} – ${end}`;
}

/**
 * One sentence naming both windows and, when they differ in length, saying so.
 *
 * `window` is the `describeRange()` block the backend returns.
 */
export function describeComparison(window) {
  if (!window?.comparedTo) return null;
  const current = formatDayRange(window.startDay, window.endDay);
  const prior = formatDayRange(window.comparedTo.startDay, window.comparedTo.endDay);
  if (!current || !prior) return null;

  const label = window.comparison === "previous_month" ? "same period last month" : "the previous period";
  // Stated only when it is true. A note that always appears is furniture a
  // reader learns to skip, and this one needs to be read on the days it fires.
  const uneven =
    window.days != null && window.comparedTo.days != null && window.days !== window.comparedTo.days
      ? ` The two windows differ in length (${window.days} vs ${window.comparedTo.days} days) because the earlier month is shorter.`
      : "";

  return {
    current,
    prior,
    label,
    uneven,
    sentence: `${current} compared against ${prior} — ${label}.${uneven}`,
  };
}
