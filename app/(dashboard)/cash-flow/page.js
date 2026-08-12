"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import Metric from "@/components/ui/Metric";
import MetricCardSkeleton from "@/components/ui/MetricCardSkeleton";
import CashForecastCard from "@/components/cards/CashForecastCard";
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

export default function CashFlowPage() {
  const { getToken } = useAuth();
  const [forecast, setForecast] = useState(null);
  const [availableCash, setAvailableCash] = useState(null);
  const [payables, setPayables] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [forecastRes, cashRes, payablesRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/metrics/cash-forecast`, { headers }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/metrics/available-cash`, { headers }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/metrics/payables`, { headers }),
        ]);
        if (cancelled) return;
        if (forecastRes.ok) setForecast(await forecastRes.json());
        else setError("Couldn't load the cash forecast.");
        if (cashRes.ok) setAvailableCash(await cashRes.json());
        if (payablesRes.ok) setPayables(await payablesRes.json());
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
  }, [getToken]);

  const verdict = forecast ? RELIABILITY[forecast.reliability] ?? RELIABILITY.directional : null;
  const closing = forecast ? paiseToRupees(forecast.totals.closingMinor) : null;
  const lastDay = forecast?.days?.[forecast.days.length - 1];

  const series = forecast
    ? [
        {
          name: "Projected balance",
          colorRole: "accent",
          points: forecast.days.map((d) => ({ x: formatDay(d.date), y: paiseToRupees(d.closingMinor) })),
        },
      ]
    : null;

  return (
    <>
      <TopNav
        title="Cash-flow forecast"
        subtitle={
          forecast
            ? `Next ${forecast.horizonDays} days · ${forecast.timezone} · generated ${new Date(forecast.generatedAt).toLocaleString("en-IN")}`
            : "Projected balance across the next 30 days"
        }
      />

      <div className="flex flex-col gap-6">
        {error ? (
          <p className="text-[13px]" style={{ color: "var(--color-destructive)" }}>{error}</p>
        ) : null}

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

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            [0, 1, 2, 3].map((i) => <MetricCardSkeleton key={i} />)
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
                    : "Set an opening balance on a bank connection"
                }
              />
              <Metric
                label={forecast?.reliability === "inflows_only" ? "Inflows only, in 30 days" : "Projected in 30 days"}
                value={closing == null ? "—" : formatInrShort(closing)}
                tone={verdict?.tone ?? "neutral"}
                sub={lastDay ? `On ${formatDay(lastDay.date)}` : ""}
              />
              <Metric
                label="Inflows expected"
                value={forecast ? formatInrShort(paiseToRupees(forecast.totals.inflowMinor)) : "—"}
                tone="neutral"
                sub="Settlements and COD remittance from orders"
              />
              <Metric
                label="Outflows expected"
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

        {series ? (
          <CashForecastCard
            label={`${forecast.horizonDays}-day cash forecast`}
            value={`${formatInrShort(closing)} ${forecast.reliability === "inflows_only" ? "of inflows" : "projected"} on ${formatDay(lastDay.date)}`}
            confidence={verdict.confidence}
            series={series}
            note={forecast.reliabilityNote}
          />
        ) : null}

        {/* What the projection is built from, component by component. This is
            the §110 trust layer: a reader can see exactly which parts are
            measured, which are assumed, and which simply do not exist. */}
        {forecast ? (
          <div className="gcard p-5">
            <div className="mb-3 text-base font-medium text-foreground">What this forecast is made of</div>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr><th>Component</th><th>Basis</th><th>Over 30 days</th><th>Why</th></tr>
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
