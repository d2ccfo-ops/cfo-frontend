"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import AlertCard from "@/components/ui/AlertCard";
import NoDataPanel from "@/components/ui/NoDataPanel";
import ExceptionTaxonomy from "@/components/cards/ExceptionTaxonomy";
import { useDateRange } from "@/components/controls/DateRangeContext";
import { toAlerts } from "@/lib/anomalies";
import { deriveSystemHealth } from "@/lib/insights";

// Two sources, deliberately, and the distinction is not cosmetic:
//
//   §17 anomalies      GET /anomalies — computed and PERSISTED by the
//                      backend's rule engine. These survive a refresh, carry
//                      a status and an owner, and accumulate history, so
//                      "how long has this been true" is answerable.
//   System health      lib/insights.js, still computed in the browser from
//                      payloads this page already fetches. A broken
//                      connector or missing COGS is not a metric that moved;
//                      it is the state of the pipeline, and there is no
//                      §17 rule for it.
//
// Both render through the same AlertCard, and the two sets are disjoint by
// construction — the four rules that moved server-side were deleted from
// deriveSystemHealth rather than left in place, so nothing double-reports.
//
// The Overview and Daily brief pages read the same two sources, so the three
// screens still cannot disagree about what is wrong.

const SEVERITIES = ["critical", "warning", "info"];

function AlertSkeleton() {
  return (
    <div className="gcard flex flex-col gap-3 p-5" role="status" aria-busy="true">
      <span className="sr-only">Loading alerts</span>
      <div className="h-4 w-1/3 animate-pulse rounded-sm bg-primary/10" />
      <div className="h-3 w-4/5 animate-pulse rounded-sm bg-primary/10" />
      <div className="h-3 w-1/4 animate-pulse rounded-sm bg-primary/10" />
    </div>
  );
}

export default function ExceptionsPage() {
  const { getToken } = useAuth();
  const { query: dateQuery, key: dateKey, preset: datePreset, ready: dateReady } = useDateRange();

  const [tab, setTab] = useState("all");
  const [payloads, setPayloads] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!dateReady) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setFailed(false);
      try {
        const token = await getToken();
        const authed = { headers: { Authorization: `Bearer ${token}` } };
        const api = process.env.NEXT_PUBLIC_API_URL;
        const [anomaliesRes, ladderRes, contributionRes, freshnessRes, burnRes, reconRes, taxonomyRes] = await Promise.all([
          // §17 anomalies. Not date-filtered: the engine runs on its own
          // trailing-28-day window and stores the period on each row, so
          // scoping this to the page's picker would silently hide findings
          // whose window doesn't line up with it.
          fetch(`${api}/anomalies`, authed),
          fetch(`${api}/metrics/revenue-ladder${dateQuery}`, authed),
          fetch(`${api}/metrics/contribution-margin${dateQuery}`, authed),
          fetch(`${api}/metrics/freshness`, authed),
          fetch(`${api}/metrics/burn-runway`, authed),
          // Money-shaped exceptions (dark COD, unmatched payments, freight
          // orphans) live in the reconciliation summary.
          fetch(`${api}/reconciliation/summary${dateQuery}`, authed),
          // P6.4. The §15 taxonomy — eleven named kinds of reconciliation
          // exception, derived server-side. Distinct from the anomalies
          // above: an anomaly is a metric that MOVED, an exception is money
          // whose whereabouts do not add up.
          fetch(`${api}/reconciliation/exceptions${dateQuery}`, authed),
        ]);
        if (cancelled) return;
        if (![anomaliesRes, ladderRes, contributionRes, freshnessRes, burnRes, reconRes, taxonomyRes].some((r) => r.ok)) {
          setFailed(true);
          return;
        }
        setPayloads({
          anomalies: anomaliesRes.ok ? await anomaliesRes.json() : null,
          ladder: ladderRes.ok ? await ladderRes.json() : null,
          contribution: contributionRes.ok ? await contributionRes.json() : null,
          freshness: freshnessRes.ok ? await freshnessRes.json() : null,
          burn: burnRes.ok ? await burnRes.json() : null,
          recon: reconRes.ok ? await reconRes.json() : null,
          taxonomy: taxonomyRes.ok ? await taxonomyRes.json() : null,
        });
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [getToken, dateQuery, dateKey, dateReady]);

  // Server findings first — they are the persisted, auditable ones, and a
  // founder scanning top-down should hit those before pipeline warnings.
  const alerts = payloads ? [...toAlerts(payloads.anomalies), ...deriveSystemHealth(payloads)] : [];
  const counts = {
    all: alerts.length,
    ...Object.fromEntries(SEVERITIES.map((s) => [s, alerts.filter((a) => a.severity === s).length])),
  };
  const visible = tab === "all" ? alerts : alerts.filter((a) => a.severity === tab);

  // Counts come from the alerts actually derived, never from a constant — the
  // old tabs said "All (5) · Critical (2)" regardless of what was on screen.
  const tabs = [
    { key: "all", label: `All (${counts.all})` },
    ...SEVERITIES.map((s) => ({
      key: s,
      label: `${s[0].toUpperCase()}${s.slice(1)} (${counts[s]})`,
    })),
  ];

  return (
    <>
      <TopNav
        title="Exceptions & alerts"
        subtitle={`Anomalies that need a human decision · ${datePreset.toLowerCase()}`}
      />

      <div className="flex flex-col gap-5">
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
            <strong className="font-medium">Couldn&apos;t reach cfo-backend.</strong> No alerts could be
            computed — this is a connection failure, not an all-clear.
          </div>
        ) : null}

        {loading ? null : (
          <div className="flex flex-wrap gap-2.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                className={`cursor-pointer rounded-md border border-border px-4 py-[7px] text-[13px] ${
                  tab === t.key ? "bg-foreground text-background" : "bg-card text-foreground"
                }`}
                onClick={() => setTab(t.key)}
                type="button"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {loading ? (
            <>
              <AlertSkeleton />
              <AlertSkeleton />
              <AlertSkeleton />
            </>
          ) : visible.length > 0 ? (
            visible.map((a) => (
              <AlertCard
                // Server rows carry a stable id; client-derived ones are
                // identified by their title, which is unique within that set.
                key={a.id}
                severity={a.severity}
                title={a.title}
                description={a.description}
                meta={a.meta}
                actionLabel={a.href ? "Investigate" : undefined}
                actionHref={a.href}
              />
            ))
          ) : failed ? null : alerts.length === 0 ? (
            <NoDataPanel
              title="Nothing flagged"
              reason="No rule fired against the data available for this period. That is a real all-clear for the checks that CAN run — but note that checks needing bank, ad or settlement data stay silent because those sources aren't connected yet."
              action="Review connections"
              href="/connections"
            />
          ) : (
            <NoDataPanel reason={`No ${tab} alerts in this period.`} />
          )}
        </div>

        {/* P6.4. Below the alerts, because an alert is something that
            changed and needs reading now, while these are a standing
            ledger of what does not add up. The severity tabs above
            deliberately do NOT filter this — the taxonomy is complete or
            it is misleading. */}
        <ExceptionTaxonomy report={payloads?.taxonomy ?? null} loading={loading} />
      </div>
    </>
  );
}
