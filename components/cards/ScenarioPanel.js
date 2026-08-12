"use client";

import { useState } from "react";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatInrShort } from "@/lib/money";

// §16 scenario panel. Every lever here maps 1:1 onto a parameter
// cfo-backend's modules/calc/cashScenario.ts actually implements — there is
// deliberately NO control for codShareDeltaPct, which the engine accepts but
// reports as not-modelled. A slider that moves and changes nothing is a
// control that lies about being interactive, which is the same reason
// AlertCard refuses to render an action button with no destination.
//
// Nothing is computed here. The panel collects parameters, posts them, and
// renders what came back — the arithmetic stays in one place, server-side,
// so a founder cannot get a different answer from the browser than from an
// export or the AI CFO later.

const LEVERS = [
  {
    key: "growthDeltaPct",
    label: "Order growth",
    min: -100,
    max: 200,
    step: 5,
    unit: "%",
    help: "Applies to orders not yet placed. Orders already in the system are a fact and never move.",
  },
  {
    key: "adSpendDeltaPct",
    label: "Ad spend",
    min: -100,
    max: 200,
    step: 5,
    unit: "%",
    help: "Changes the measured ads and operating run-rate, not vendor bills.",
  },
  {
    key: "rtoDeltaPct",
    label: "RTO rate",
    min: -20,
    max: 40,
    step: 1,
    unit: " pts",
    help: "Percentage points. COD that comes back never becomes cash.",
  },
  {
    key: "collectionAccelDays",
    label: "Collect sooner",
    min: -15,
    max: 9,
    step: 1,
    unit: " days",
    help: "Pulls cash from orders already placed forward. Capped at the COD remittance lag — money cannot arrive before the order that creates it.",
  },
  {
    key: "vendorPaymentDelayDays",
    label: "Delay vendor bills",
    min: -30,
    max: 90,
    step: 5,
    unit: " days",
    help: "Moves bill payments later. Rent, payroll and ads are a run-rate, not a bill, so they do not move.",
  },
];

const EMPTY = Object.fromEntries(LEVERS.map((l) => [l.key, 0]));

const money = (minor) => formatInrShort(Number(minor) / 100);

function formatDay(iso) {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export default function ScenarioPanel({ onRun, running, result, error }) {
  const [values, setValues] = useState(EMPTY);
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");

  // Only non-zero levers are sent. Posting every slider at 0 would make the
  // response's appliedLevers list every lever as "inert", burying the ones
  // the founder actually moved under five that they didn't.
  function buildParams() {
    const params = {};
    for (const l of LEVERS) if (values[l.key] !== 0) params[l.key] = values[l.key];
    const amount = Number(purchaseAmount);
    if (amount > 0 && purchaseDate) {
      params.inventoryPurchase = { amountPaise: String(Math.round(amount * 100)), date: purchaseDate };
    }
    return params;
  }

  const params = buildParams();
  const touched = Object.keys(params).length > 0;

  const comparison = result?.scenario?.comparison;
  const inertLevers = (result?.scenario?.appliedLevers ?? []).filter((l) => !l.applied);

  return (
    <div className="gcard p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <div className="text-base font-medium text-foreground">What if?</div>
        {touched ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setValues(EMPTY);
              setPurchaseAmount("");
              setPurchaseDate("");
            }}
          >
            Reset
          </button>
        ) : null}
      </div>
      <p className="mb-4 text-[13px] text-muted-foreground">
        Deterministic — the same settings always produce the same line, so a number you act on can be
        reproduced later. Nothing is saved and nothing is changed.
      </p>

      <div className="flex flex-col gap-4">
        {LEVERS.map((l) => (
          <div key={l.key}>
            <div className="flex items-baseline justify-between gap-3">
              <label className="text-[13px] font-medium text-foreground" htmlFor={`lever-${l.key}`}>
                {l.label}
              </label>
              <span className="text-[13px] tabular-nums text-muted-foreground">
                {values[l.key] > 0 ? "+" : ""}
                {values[l.key]}
                {l.unit}
              </span>
            </div>
            <input
              id={`lever-${l.key}`}
              type="range"
              className="mt-1 w-full"
              min={l.min}
              max={l.max}
              step={l.step}
              value={values[l.key]}
              onChange={(e) => setValues((v) => ({ ...v, [l.key]: Number(e.target.value) }))}
            />
            <p className="mt-0.5 text-xs text-muted-foreground">{l.help}</p>
          </div>
        ))}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="purchase-amount">One-off purchase (₹)</label>
            <input
              id="purchase-amount"
              className="input"
              type="number"
              min="0"
              placeholder="e.g. 500000"
              value={purchaseAmount}
              onChange={(e) => setPurchaseAmount(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="purchase-date">on</label>
            <input
              id="purchase-date"
              className="input"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-block mt-4"
        disabled={running || !touched}
        onClick={() => onRun(params)}
      >
        {running ? "Running…" : touched ? "Run scenario" : "Move a lever to run a scenario"}
      </button>

      {error ? (
        <p className="mt-3 text-[13px]" style={{ color: "var(--color-destructive)" }} role="alert">
          {error}
        </p>
      ) : null}

      {comparison ? (
        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-2 text-[13px] font-medium text-foreground">Against the base forecast</div>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Closing balance</dt>
              <dd className="text-[15px] text-foreground">
                {money(comparison.closingMinor)}{" "}
                <DeltaTag minor={comparison.closingDeltaMinor} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Lowest point</dt>
              <dd className="text-[15px] text-foreground">
                {money(comparison.lowestBalanceMinor)}{" "}
                <DeltaTag minor={comparison.lowestBalanceDeltaMinor} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Cash shortage</dt>
              <dd className="text-[15px] text-foreground">
                <ShortageTag base={comparison.baseCashShortageDate} scenario={comparison.scenarioCashShortageDate} />
              </dd>
            </div>
          </dl>

          {/* A lever that did nothing must say so. Silently ignoring a slider
              the founder moved is how a scenario becomes untrustworthy. */}
          {inertLevers.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1.5">
              {inertLevers.map((l) => (
                <li key={l.key} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{l.key}</span> had no effect — {l.note}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DeltaTag({ minor }) {
  const v = Number(minor);
  if (v === 0) return <StatusBadge status="neutral" label="no change" />;
  return <StatusBadge status={v > 0 ? "positive" : "negative"} label={`${v > 0 ? "+" : "−"}${money(Math.abs(v))}`} />;
}

// The four cases are genuinely different and none of them is "—": a scenario
// that CAUSES a shortage, one that REMOVES it, one where it merely moves, and
// one where there was never a shortage on either side.
function ShortageTag({ base, scenario }) {
  if (!base && !scenario) return <StatusBadge status="positive" label="None in this horizon" />;
  if (!base && scenario) return <StatusBadge status="negative" label={`Causes one on ${formatDay(scenario)}`} />;
  if (base && !scenario) return <StatusBadge status="positive" label={`Avoids the one on ${formatDay(base)}`} />;
  if (base === scenario) return <StatusBadge status="warning" label={`Still ${formatDay(base)}`} />;
  return (
    <StatusBadge
      status={scenario > base ? "positive" : "negative"}
      label={`${formatDay(base)} → ${formatDay(scenario)}`}
    />
  );
}
