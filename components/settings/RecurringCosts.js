"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { formatInrShort } from "@/lib/money";

// P2.2e's editor. These entries are the only way payroll, rent and EMI reach
// the cash forecast on the day they actually leave the account — without them
// the 90-day line carries fixed costs as a flat daily smear, or, for an org
// with no accounting connected, not at all.
//
// Nothing is computed here beyond a monthly-equivalent preview, and that is
// labelled as a preview. The forecast's arithmetic stays server-side so a
// founder cannot get one answer from this page and another from the cash-flow
// page or an export.

const CATEGORIES = [
  { value: "SALARY", label: "Salary / payroll" },
  { value: "RENT", label: "Rent" },
  { value: "EMI", label: "Loan / EMI" },
  { value: "SUBSCRIPTION", label: "Subscription" },
  { value: "TAX", label: "Tax" },
  { value: "OTHER", label: "Other" },
];

const CADENCES = [
  { value: "MONTHLY", label: "Every month" },
  { value: "QUARTERLY", label: "Every quarter" },
  { value: "ANNUAL", label: "Once a year" },
  { value: "WEEKLY", label: "Every week" },
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Mirrors modules/calc/recurringOutflows.ts. Duplicated deliberately and kept
// display-only: this drives a preview line, never a stored figure, so a drift
// between the two shows up as a slightly wrong preview rather than as a wrong
// forecast.
function monthlyEquivalentPaise(entry) {
  const amount = Number(entry.amountPaise || 0);
  switch (entry.cadence) {
    case "WEEKLY":
      return Math.floor((amount * 52) / 12);
    case "QUARTERLY":
      return Math.floor(amount / 3);
    case "ANNUAL":
      return Math.floor(amount / 12);
    default:
      return amount;
  }
}

function blankEntry() {
  return {
    // crypto.randomUUID is available in every browser this app supports and
    // avoids two rows created in the same millisecond colliding, which a
    // timestamp id would.
    id: crypto.randomUUID(),
    label: "",
    category: "SALARY",
    amountRupees: "",
    cadence: "MONTHLY",
    dayOfMonth: 1,
    weekday: 1,
    month: 4,
  };
}

/** Server shape → form shape. Money arrives as paise; the field takes rupees. */
function toForm(e) {
  return {
    id: e.id,
    label: e.label,
    category: e.category,
    amountRupees: String(Number(e.amountPaise) / 100),
    cadence: e.cadence,
    dayOfMonth: e.dayOfMonth ?? 1,
    weekday: e.weekday ?? 1,
    month: e.month ?? 4,
  };
}

/**
 * Form shape → server shape.
 *
 * Only the fields the chosen cadence actually uses are sent. The server
 * rejects unknown keys and requires a weekday on weekly entries and a
 * dayOfMonth on the rest, so posting the whole form would either 400 or store
 * a weekday nobody chose against a monthly rent.
 */
function toApi(e) {
  const base = {
    id: e.id,
    label: e.label.trim(),
    category: e.category,
    amountPaise: String(Math.round(Number(e.amountRupees) * 100)),
    cadence: e.cadence,
  };
  if (e.cadence === "WEEKLY") return { ...base, weekday: Number(e.weekday) };
  const withDay = { ...base, dayOfMonth: Number(e.dayOfMonth) };
  if (e.cadence === "ANNUAL" || e.cadence === "QUARTERLY") return { ...withDay, month: Number(e.month) };
  return withDay;
}

function describe(e) {
  const day = Number(e.dayOfMonth);
  const ordinal = day === 1 ? "1st" : day === 2 ? "2nd" : day === 3 ? "3rd" : `${day}th`;
  switch (e.cadence) {
    case "WEEKLY":
      return `every ${WEEKDAYS[Number(e.weekday)]}`;
    case "MONTHLY":
      return `on the ${ordinal} of each month`;
    case "QUARTERLY":
      return `on the ${ordinal}, every 3 months from ${MONTHS[Number(e.month) - 1]}`;
    case "ANNUAL":
      return `on the ${ordinal} of ${MONTHS[Number(e.month) - 1]}`;
    default:
      return "";
  }
}

export default function RecurringCosts() {
  const { getToken } = useAuth();
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/preferences/org`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Could not load settings (${res.status})`);
        const body = await res.json();
        if (cancelled) return;
        setEntries((body.settings?.recurringOutflows ?? []).map(toForm));
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const update = useCallback((id, patch) => {
    setSaved(false);
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/preferences/org`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recurringOutflows: entries.map(toApi) }),
      });
      if (!res.ok) {
        // The server's validation message, not a generic one. It knows which
        // entry failed and why ("weekly entries need a weekday"); replacing
        // that with "Save failed" would leave a founder guessing.
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message || body.error || `Save failed (${res.status})`);
      }
      const body = await res.json();
      setEntries((body.settings?.recurringOutflows ?? []).map(toForm));
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  const complete = entries.filter((e) => e.label.trim() && Number(e.amountRupees) > 0);
  const monthlyTotal = complete.reduce((sum, e) => sum + monthlyEquivalentPaise({ ...e, amountPaise: Math.round(Number(e.amountRupees) * 100) }), 0);
  const incomplete = entries.length - complete.length;

  return (
    <div>
      <p className="mb-4 text-[13px] text-muted-foreground">
        Payroll, rent, EMI and tax leave your account on fixed dates. Adding them here puts them on the
        cash-flow forecast on the day they actually go out, instead of as a flat daily average — which is
        what makes a squeeze around a pay date visible. If your accounting is connected, these are
        matched against measured spend rather than added on top, so nothing is counted twice.
      </p>

      {entries.length === 0 ? (
        <div className="gcard flex flex-col items-start gap-2 p-5">
          <div className="text-[15px] font-medium text-foreground">No fixed costs added</div>
          <p className="mb-0 text-[13px] text-muted-foreground">
            Until you add them, the 30 and 90-day cash forecasts carry salary and rent only as a daily
            average — and if no accounting system is connected, not at all.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {entries.map((e) => (
          <div key={e.id} className="gcard p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_140px_150px]">
              <div className="field">
                <label htmlFor={`label-${e.id}`}>Name</label>
                <input
                  id={`label-${e.id}`}
                  className="input"
                  placeholder="e.g. Warehouse rent"
                  value={e.label}
                  onChange={(ev) => update(e.id, { label: ev.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor={`amount-${e.id}`}>Amount (₹)</label>
                <input
                  id={`amount-${e.id}`}
                  className="input"
                  type="number"
                  min="1"
                  placeholder="400000"
                  value={e.amountRupees}
                  onChange={(ev) => update(e.id, { amountRupees: ev.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor={`category-${e.id}`}>Type</label>
                <select
                  id={`category-${e.id}`}
                  className="input"
                  value={e.category}
                  onChange={(ev) => update(e.id, { category: ev.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-1 grid gap-3 sm:grid-cols-[150px_140px_150px]">
              <div className="field">
                <label htmlFor={`cadence-${e.id}`}>How often</label>
                <select
                  id={`cadence-${e.id}`}
                  className="input"
                  value={e.cadence}
                  onChange={(ev) => update(e.id, { cadence: ev.target.value })}
                >
                  {CADENCES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {e.cadence === "WEEKLY" ? (
                <div className="field">
                  <label htmlFor={`weekday-${e.id}`}>On</label>
                  <select
                    id={`weekday-${e.id}`}
                    className="input"
                    value={e.weekday}
                    onChange={(ev) => update(e.id, { weekday: Number(ev.target.value) })}
                  >
                    {WEEKDAYS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="field">
                  <label htmlFor={`day-${e.id}`}>Day of month</label>
                  <input
                    id={`day-${e.id}`}
                    className="input"
                    type="number"
                    min="1"
                    max="31"
                    value={e.dayOfMonth}
                    onChange={(ev) => update(e.id, { dayOfMonth: Number(ev.target.value) })}
                  />
                </div>
              )}

              {e.cadence === "ANNUAL" || e.cadence === "QUARTERLY" ? (
                <div className="field">
                  <label htmlFor={`month-${e.id}`}>{e.cadence === "ANNUAL" ? "Month" : "Starting from"}</label>
                  <select
                    id={`month-${e.id}`}
                    className="input"
                    value={e.month}
                    onChange={(ev) => update(e.id, { month: Number(ev.target.value) })}
                  >
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-3">
              <p className="mb-0 text-xs text-muted-foreground">
                {describe(e)}
                {/* Stated up front rather than discovered in February. The
                    server clamps to the last day of a short month — it never
                    skips the payment. */}
                {e.cadence !== "WEEKLY" && Number(e.dayOfMonth) > 28
                  ? " — in months with fewer days, this is charged on the last day"
                  : ""}
              </p>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setSaved(false);
                  setEntries((list) => list.filter((x) => x.id !== e.id));
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setSaved(false);
            setEntries((list) => [...list, blankEntry()]);
          }}
        >
          Add a fixed cost
        </button>
        <button type="button" className="btn btn-primary" disabled={saving || incomplete > 0} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
        {/* The button is disabled rather than the row silently dropped: an
            entry with no amount is one someone started and did not finish, and
            saving around it would lose their work without saying so. */}
        {incomplete > 0 ? (
          <span className="text-[13px] text-muted-foreground">
            {incomplete} entr{incomplete === 1 ? "y needs" : "ies need"} a name and an amount
          </span>
        ) : null}
        {saved ? <span className="text-[13px] text-success">Saved</span> : null}
      </div>

      {complete.length > 0 ? (
        <p className="mt-3 mb-0 text-[13px] text-muted-foreground">
          About {formatInrShort(monthlyTotal / 100)} a month across {complete.length} fixed cost
          {complete.length === 1 ? "" : "s"}. Preview only — the forecast does this arithmetic on the
          server, on the real dates.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 mb-0 text-[13px]" style={{ color: "var(--color-destructive)" }} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
