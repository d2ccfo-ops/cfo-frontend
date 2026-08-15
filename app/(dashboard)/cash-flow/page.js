"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import Metric from "@/components/ui/Metric";
import DataStatusBadge from "@/components/ui/DataStatusBadge";
import MetricCardSkeleton from "@/components/ui/MetricCardSkeleton";
import CashForecastCard from "@/components/cards/CashForecastCard";
import ScenarioPanel from "@/components/cards/ScenarioPanel";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatInrShort } from "@/components/ui/AbbrCurrency";

// Every figure here comes from cfo-backend's modules/calc/cashForecast.ts.
// This page previously shipped a hardcoded ₹1.68 Cr projection and six invented
// vendor payments — the most dangerous kind of mock, because a cash forecast is
// exactly the screen a founder acts on.
//
// The forecast reports its own reliability, and this page renders that verdict
// rather than burying it: with no accounting or ads connection there is no
// outflow data at all, and a line that only ever goes up must not be presented
// as a cash balance.

const RELIABILITY = {
  usable: { confidence: "high", tone: "positive" },
  directional: { confidence: "medium", tone: "warning" },
  inflows_only: { confidence: "none", tone: "negative" },
};

const BASIS_TONE = {
  measured: "positive",
  assumed: "warning",
  unavailable: "neutral",
};

const BASIS_LABEL = {
  measured: "Measured",
  assumed: "Assumed",
  unavailable: "No data source",
};

const paiseToRupees = (minor) => Number(minor) / 100;

function formatDay(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// §16 horizons. Each answers a different question, which is why they are a
// fixed set and not a free number.
const HORIZONS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export default function CashFlowPage() {
  const { getToken } = useAuth();
  const [horizon, setHorizon] = useState(30);
  const [forecast, setForecast] = useState(null);
  const [availableCash, setAvailableCash] = useState(null);
  const [payables, setPayables] = useState(null);
  const [burn, setBurn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scenario, setScenario] = useState(null);
  const [scenarioRunning, setScenarioRunning] = useState(false);
  const [scenarioError, setScenarioError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // A stale scenario line drawn against a freshly-changed horizon would
      // be comparing two different questions, so it is cleared rather than
      // left on screen while the new base loads.
      setScenario(null);
      setScenarioError("");
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [forecastRes, cashRes, payablesRes, burnRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/metrics/cash-forecast?horizon=${horizon}`, { headers }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/metrics/available-cash`, { headers }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/metrics/payables`, { headers }),
          // Runway is the number a founder acts on from THIS screen — it was
          // rendered on exceptions and daily-brief but absent from the one
          // page that is actually about cash.
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/metrics/burn-runway`, { headers }),
        ]);
        if (cancelled) return;
        if (forecastRes.ok) setForecast(await forecastRes.json());
        else setError("Couldn't load the cash forecast.");
        if (cashRes.ok) setAvailableCash(await cashRes.json());
        if (payablesRes.ok) setPayables(await payablesRes.json());
        if (burnRes.ok) setBurn(await burnRes.json());
      } catch {
        if (!cancelled) setError("Couldn't reach the backend.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [getToken, horizon]);

  async function runScenario(params) {
    setScenarioRunning(true);
    setScenarioError("");
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/metrics/cash-forecast/scenario`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ horizon, ...params }),
      });
      if (!res.ok) {
        setScenarioError("Couldn't run that scenario.");
        setScenario(null);
        return;
      }
      setScenario(await res.json());
    } catch {
      setScenarioError("Couldn't reach the backend.");
      setScenario(null);
    } finally {
      setScenarioRunning(false);
    }
  }

  const verdict = forecast ? RELIABILITY[forecast.reliability] ?? RELIABILITY.directional : null;
  const closing = forecast ? paiseToRupees(forecast.totals.closingMinor) : null;
  const lastDay = forecast?.days?.[forecast.days.length - 1];

  // When a scenario is showing, the base is drawn from the SERVER's copy of
  // it (scenario.base), not from the separately-fetched `forecast` — the two
  // were computed at different instants, and diffing across that gap would
  // attribute ordinary elapsed time to the scenario.
  const baseDays = scenario?.base?.days ?? forecast?.days ?? null;
  const series = baseDays
    ? [
        {
          name: scenario ? "Base" : "Projected balance",
          colorRole: scenario ? "neutral" : "accent",
          points: baseDays.map((d) => ({ x: formatDay(d.date), y: paiseToRupees(d.closingMinor) })),
        },
        ...(scenario
          ? [
              {
                name: "Scenario",
                colorRole: "accent",
                points: scenario.scenario.days.map((d) => ({ x: formatDay(d.date), y: paiseToRupees(d.closingMinor) })),
              },
            ]
          : []),
      ]
    : null;

  return (
    <>
      <TopNav
        title="Cash-flow forecast"
        subtitle={
          forecast
            ? `Next ${forecast.horizonDays} days · ${forecast.timezone} · generated ${new Date(forecast.generatedAt).toLocaleString("en-IN")}`
            : `Projected balance across the next ${horizon} days`
        }
      />

      <div className="flex flex-col gap-6">
        {error ? (
          <p className="text-[13px]" style={{ color: "var(--color-destructive)" }}>{error}</p>
        ) : null}

        {/* §16 horizon. The projected-inflow share is shown beside it because
            a longer horizon is not the same forecast drawn further — it is a
            progressively larger share of extrapolation, and the two controls
            belong next to each other. */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="seg" role="group" aria-label="Forecast horizon">
            {HORIZONS.map((h) => (
              <button
                key={h.days}
                type="button"
                className="seg-opt"
                aria-pressed={horizon === h.days}
                onClick={() => setHorizon(h.days)}
              >
                {h.label}
              </button>
            ))}
          </div>
          {forecast ? (
            <span className="text-xs text-muted-foreground">
              {forecast.projectedInflowSharePct}% of projected inflow is from orders not yet placed
            </span>
          ) : null}
        </div>

        {/* The verdict, above the numbers rather than in a footnote. A reader
            who only looks at the top of this page must still see it. */}
        {forecast && forecast.reliability !== "usable" ? (
          <div
            className="rounded-lg border p-4"
            style={{
              borderColor: verdict.tone === "negative" ? "var(--color-destructive)" : "var(--color-accent)",
              background: verdict.tone === "negative" ? "var(--color-destructive-soft)" : "var(--color-accent-soft)",
            }}
          >
            <div
              className="text-[13.5px] font-medium"
              style={{ color: verdict.tone === "negative" ? "var(--color-destructive)" : "var(--color-accent)" }}
            >
              {forecast.reliability === "inflows_only" ? "This is not a cash balance" : "Partial forecast"}
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">{forecast.reliabilityNote}</p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {loading ? (
            [0, 1, 2, 3, 4].map((i) => <MetricCardSkeleton key={i} />)
          ) : (
            <>
              <Metric
                label="Available cash today"
                value={
                  forecast?.openingBalance.basis === "measured"
                    ? formatInrShort(paiseToRupees(forecast.openingBalance.valueMinor))
                    : "Not set"
                }
                change={availableCash?.changePct != null ? `${availableCash.changePct > 0 ? "+" : ""}${availableCash.changePct}% vs last month` : undefined}
                tone={availableCash?.changePct > 0 ? "positive" : "neutral"}
                sub={
                  forecast?.openingBalance.basis === "measured"
                    ? "Bank balance across connected accounts"
                    : (availableCash?.missingOpeningBalance?.length ?? 0) > 0
                      ? // Which account to fix, not just that one needs fixing.
                        `${availableCash.missingOpeningBalance.length} bank connection${availableCash.missingOpeningBalance.length === 1 ? " needs" : "s need"} an opening balance — Connections page`
                      : "Set an opening balance on a bank connection"
                }
              />
              <Metric
                label={
                  forecast?.reliability === "inflows_only"
                    ? `Inflows only, in ${forecast.horizonDays} days`
                    : `Projected in ${forecast?.horizonDays ?? horizon} days`
                }
                badge={<DataStatusBadge dataStatus={forecast?.dataStatus} />}
                value={closing == null ? "—" : formatInrShort(closing)}
                tone={verdict?.tone ?? "neutral"}
                sub={lastDay ? `On ${formatDay(lastDay.date)}` : ""}
              />
              <Metric
                label="Inflows expected"
                badge={<DataStatusBadge dataStatus={forecast?.dataStatus} />}
                value={forecast ? formatInrShort(paiseToRupees(forecast.totals.inflowMinor)) : "—"}
                tone="neutral"
                sub="Settlements and COD remittance from orders"
              />
              {/* §16 — the trough, not the endpoint. A line that dips below
                  zero in week three and recovers by week twelve ends healthy
                  and is still a crisis, so the closing balance alone cannot
                  answer "will I run out". */}
              <Metric
                label="Lowest projected point"
                badge={<DataStatusBadge dataStatus={forecast?.dataStatus} />}
                value={forecast ? formatInrShort(paiseToRupees(forecast.lowestBalance.valueMinor)) : "—"}
                tone={
                  forecast?.cashShortageDate
                    ? "negative"
                    : forecast && Number(forecast.lowestBalance.valueMinor) < Number(forecast.openingBalance.valueMinor)
                      ? "warning"
                      : "neutral"
                }
                sub={
                  forecast
                    ? forecast.cashShortageDate
                      ? `Goes negative on ${formatDay(forecast.cashShortageDate)}`
                      : `On ${formatDay(forecast.lowestBalance.date)} · no shortage in this horizon`
                    : ""
                }
              />
              <Metric
                label="Outflows expected"
                badge={<DataStatusBadge dataStatus={forecast?.dataStatus} />}
                value={
                  forecast
                    ? forecast.totals.outflowMinor === "0"
                      ? "No data"
                      : formatInrShort(paiseToRupees(forecast.totals.outflowMinor))
                    : "—"
                }
                tone={forecast?.totals.outflowMinor === "0" ? "negative" : "neutral"}
                sub={
                  forecast?.totals.outflowMinor === "0"
                    ? "Connect accounting or ads to see spend"
                    : "Vendor bills, operating spend and ads"
                }
              />
            </>
          )}
        </div>

        {/* §55/§85 — burn and runway. A founder acts on runway from exactly
            this screen; it lived only on exceptions and the daily brief. */}
        {!loading && burn ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric
              label="Monthly net burn"
              value={burn.burning ? formatInrShort(burn.monthlyNetBurn) : "Not burning"}
              change={`${burn.observedDays} days observed · ${burn.transactionCount} bank transactions`}
              tone={burn.burning ? "warning" : "positive"}
              sub={burn.burning ? "Outflows exceed inflows on the observed window" : "Inflows cover outflows on the observed window"}
            />
            <Metric
              label="Runway"
              value={burn.runwayMonths != null ? `${burn.runwayMonths} months` : "—"}
              tone={burn.runwayMonths != null && burn.runwayMonths < 6 ? "negative" : "neutral"}
              sub={burn.runwayReason}
            />
            <Metric
              label="Net movement (observed)"
              value={formatInrShort(burn.netMovement)}
              change={`in ${formatInrShort(burn.inflow)} · out ${formatInrShort(burn.outflow)}`}
              tone={burn.netMovement >= 0 ? "positive" : "warning"}
              sub={(burn.warnings ?? [])[0] ?? "From imported bank transactions"}
            />
          </div>
        ) : null}

        {series ? (
          <CashForecastCard
            label={`${forecast.horizonDays}-day cash forecast`}
            value={`${formatInrShort(closing)} ${forecast.reliability === "inflows_only" ? "of inflows" : "projected"} on ${formatDay(lastDay.date)}`}
            confidence={verdict.confidence}
            series={series}
            // With a scenario on screen the legend has to be readable, so it
            // is switched on only then — a single unlabelled line needs no key.
            showLegend={Boolean(scenario)}
            note={scenario ? scenario.scenario.reliabilityNote : forecast.reliabilityNote}
          />
        ) : null}

        {forecast ? (
          <ScenarioPanel
            onRun={runScenario}
            running={scenarioRunning}
            result={scenario}
            error={scenarioError}
          />
        ) : null}

        {/* What the projection is built from, component by component. This is
            the §110 trust layer: a reader can see exactly which parts are
            measured, which are assumed, and which simply do not exist. */}
        {forecast ? (
          <div className="gcard p-5">
            <div className="mb-3 text-base font-medium text-foreground">What this forecast is made of</div>
            <div style={{ overflowX: "auto" }}>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr><th>Component</th><th>Basis</th><th>{`Over ${forecast.horizonDays} days`}</th><th>Why</th></tr>
                  </thead>
                  <tbody>
                    {forecast.components.map((c) => (
                      <tr key={c.key}>
                        <td className="font-medium text-foreground">{c.label}</td>
                        <td><StatusBadge status={BASIS_TONE[c.basis]} label={BASIS_LABEL[c.basis]} /></td>
                        <td>{c.basis === "unavailable" ? "—" : formatInrShort(paiseToRupees(c.valueMinor))}</td>
                        <td className="text-[12.5px] text-muted-foreground" style={{ maxWidth: 420 }}>{c.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Timing assumptions: prepaid settles T+{forecast.assumptions.prepaidSettlementLagDays}, COD remits
              T+{forecast.assumptions.codRemittanceLagDays}. Velocity measured over the trailing{" "}
              {forecast.assumptions.velocityWindowDays} days. Both become measurable once a gateway and a courier
              are connected.
            </p>
          </div>
        ) : null}

        <div className="gcard p-5">
          <div className="mb-2.5 text-base font-medium text-foreground">Upcoming payments</div>
          {payables?.upcoming?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Payee</th><th>Bill</th><th>Amount</th><th>Due date</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {payables.upcoming.map((p) => {
                    // Measured against the server's own calculation timestamp,
                    // not Date.now(). Reading the clock during render is impure
                    // — and it would also mean "due in 2 days" could silently
                    // change on a re-render that fetched nothing.
                    const days = Math.ceil(
                      (new Date(`${p.dueDate}T00:00:00Z`) - new Date(payables.lastCalculatedAt)) / 86400000
                    );
                    const tone = days < 0 ? "negative" : days <= 3 ? "warning" : "neutral";
                    const label = days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? "Due today" : `Due in ${days} days`;
                    return (
                      <tr key={`${p.vendorName}-${p.billNumber}`}>
                        <td>{p.vendorName}</td>
                        <td className="text-[12.5px] text-muted-foreground">{p.billNumber}</td>
                        <td>{formatInrShort(p.balance)}</td>
                        <td>{formatDay(p.dueDate)}</td>
                        <td><StatusBadge status={tone} label={label} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              No scheduled payments are known. Vendor bills come from an accounting connection (Zoho Books) — without
              one, payroll, rent, GST and vendor invoices are invisible to this forecast.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
