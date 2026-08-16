"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { useSelectedEntity } from "./entityStore";

// The date filter lives in the global header but the data lives in pages, so
// the selection has to be shared state rather than local picker state. Every
// page that fetches real metrics reads `query` from here and appends it to its
// request URLs; changing the preset re-runs those effects.

// "Month to date" is first and is the default deliberately. The backend's
// no-parameters behaviour IS month-to-date (see cfo-backend/src/lib/dateRange.ts),
// so any other default would have the header claiming one period while the
// cards computed another — which is exactly what the old decorative picker did,
// showing "Last 30 days" over month-to-date numbers.
//
// Month to date also gets a better comparison than the rest: the backend
// compares it against the same slice of the previous month, whereas an explicit
// range can only be compared against the equal-length window immediately
// before it.
export const PRESETS = [
  "Month to date",
  "Today",
  "Last 7 days",
  "Last 30 days",
  "This quarter",
  "This financial year",
  "Custom range",
];

export const DEFAULT_PRESET = "Month to date";

// Local calendar date, not toISOString() — that converts to UTC first and in
// IST would call it "yesterday" for the first 5.5 hours of every day.
export function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysAgo(n, today) {
  const d = new Date(today);
  d.setDate(d.getDate() - (n - 1)); // inclusive of today
  return d;
}

// Indian financial year: 1 April – 31 March. Quarters follow it (Q1 = Apr–Jun)
// rather than the calendar, since a CFO tool for Indian companies reporting
// "this quarter" means the fiscal one.
function financialYearStart(today) {
  const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return new Date(year, 3, 1);
}

function fiscalQuarterStart(today) {
  const fyStart = financialYearStart(today);
  const monthsIn = (today.getFullYear() - fyStart.getFullYear()) * 12 + (today.getMonth() - fyStart.getMonth());
  const quarterIndex = Math.floor(monthsIn / 3);
  return new Date(fyStart.getFullYear(), fyStart.getMonth() + quarterIndex * 3, 1);
}

// Returns { from, to } as YYYY-MM-DD, or null meaning "send no parameters and
// let the backend apply its month-to-date default".
export function resolvePreset(preset, custom, today = new Date()) {
  const to = toIsoDate(today);
  switch (preset) {
    case "Month to date":
      return null;
    case "Today":
      return { from: to, to };
    case "Last 7 days":
      return { from: toIsoDate(daysAgo(7, today)), to };
    case "Last 30 days":
      return { from: toIsoDate(daysAgo(30, today)), to };
    case "This quarter":
      return { from: toIsoDate(fiscalQuarterStart(today)), to };
    case "This financial year":
      return { from: toIsoDate(financialYearStart(today)), to };
    case "Custom range":
      // Incomplete or backwards custom input falls back to the default rather
      // than firing a request the backend will reject with a 400.
      if (!custom?.from || !custom?.to || custom.from > custom.to) return null;
      return { from: custom.from, to: custom.to };
    default:
      return null;
  }
}

const DateRangeContext = createContext(null);

// The selection survives a reload, but stays on the device — localStorage, not
// the server. Which period you are looking at is a "right now" question: a
// founder who drills into last quarter on a laptop should not find their phone
// showing last quarter tomorrow morning. Card layout is the opposite case and
// is stored server-side, per user — see cfo-backend/src/routes/preferences.ts.
const STORAGE_KEY = "cfoos-date-range";

function readStored() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validated, not trusted: localStorage is user-editable, and a preset this
    // build no longer ships would resolve to a null range and silently turn
    // every request back into the default period.
    if (!PRESETS.includes(parsed?.preset)) return null;
    const custom = parsed.custom ?? { from: "", to: "" };
    if (typeof custom.from !== "string" || typeof custom.to !== "string") return null;
    // A stored "Custom range" with no dates would render a picker claiming a
    // custom window while the backend served the default one.
    if (parsed.preset === "Custom range" && !(custom.from && custom.to)) return null;
    return { preset: parsed.preset, custom };
  } catch {
    return null;
  }
}

// localStorage is external state, so it is read through useSyncExternalStore
// rather than copied into React state inside an effect. That pattern — render
// the default, then setState from an effect — is what causes the flash of the
// wrong period on every reload, and React now lints against it outright.
//
// The server snapshot is the shipped default, so server HTML and the hydration
// render agree; React then syncs to the client snapshot and re-renders once.
// `hydrated` rides inside the snapshot so consumers can tell the two apart
// without a second piece of state.
const SERVER_SNAPSHOT = Object.freeze({
  preset: DEFAULT_PRESET,
  custom: Object.freeze({ from: "", to: "" }),
  hydrated: false,
});

let clientSnapshot = null;
const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Must return a STABLE reference between changes — rebuilding the object on
// every call would make useSyncExternalStore re-render forever.
function getSnapshot() {
  if (clientSnapshot === null) {
    const stored = readStored();
    clientSnapshot = {
      preset: stored?.preset ?? DEFAULT_PRESET,
      custom: stored?.custom ?? { from: "", to: "" },
      hydrated: true,
    };
  }
  return clientSnapshot;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function writeStore(next) {
  clientSnapshot = { preset: next.preset, custom: next.custom, hydrated: true };
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ preset: next.preset, custom: next.custom })
    );
  } catch {
    // Private browsing, or the quota is full. The filter still works for this
    // session; only persistence is lost, which isn't worth interrupting anyone
    // over.
  }
  for (const listener of listeners) listener();
}

export function DateRangeProvider({ children }) {
  const { preset, custom, hydrated } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  // P5.6. The selected legal entity is folded into the SAME query string every
  // page already appends, so entity filtering reaches all fourteen pages
  // through one change here rather than through fourteen call sites — twelve
  // of which somebody would get right.
  const { id: legalEntityId, resolved: entityResolved } = useSelectedEntity();

  const setPreset = useCallback((next) => {
    writeStore({ ...getSnapshot(), preset: next });
  }, []);

  // Accepts an updater as well as a value — the picker's two date inputs each
  // patch one end of the range with `(c) => ({ ...c, from })`.
  const setCustom = useCallback((next) => {
    const current = getSnapshot();
    writeStore({
      ...current,
      custom: typeof next === "function" ? next(current.custom) : next,
    });
  }, []);

  const value = useMemo(() => {
    const range = resolvePreset(preset, custom);
    const params = [];
    if (range) params.push(`from=${range.from}`, `to=${range.to}`);
    if (legalEntityId) params.push(`legalEntityId=${encodeURIComponent(legalEntityId)}`);
    return {
      preset,
      setPreset,
      custom,
      setCustom,
      range,
      legalEntityId,
      // Appended directly to fetch URLs. Empty string for the default period
      // and no entity, which is what makes "no filter" and "month to date over
      // the whole organisation" the same request.
      query: params.length > 0 ? `?${params.join("&")}` : "",
      // Included in effect dependency arrays: a string changes identity only
      // when the actual window or entity changes, unlike the `range` object.
      key: `${range ? `${range.from}..${range.to}` : "default"}::${legalEntityId ?? "all"}`,
      label: preset,
      // False for the first tick, while the stored selection is being read
      // back. Pages hold their fetches until it flips, otherwise every reload
      // would fire one request for the default period, paint those numbers,
      // then immediately fire another for the restored one — a visible flash of
      // the wrong period and a wasted round trip on every page load.
      // AND the entity, for the same reason. Before this, `ready` flipped as
      // soon as the stored date was read — while the legal entity was still
      // null-because-unknown — so every page fetched unfiltered and then
      // refetched ~4.5s later when GET /legal-entities landed.
      ready: hydrated && entityResolved,
    };
  }, [preset, custom, setPreset, setCustom, hydrated, legalEntityId, entityResolved]);

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) {
    throw new Error("useDateRange must be used inside DateRangeProvider (see app/(dashboard)/layout.js)");
  }
  return ctx;
}
