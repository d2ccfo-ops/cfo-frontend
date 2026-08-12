"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import AlertCard from "@/components/ui/AlertCard";
import NoDataPanel from "@/components/ui/NoDataPanel";
import { useDateRange } from "@/components/controls/DateRangeContext";
import { deriveAnomalies } from "@/lib/insights";

// Every alert here is derived from live metric payloads by lib/insights.js —
// the same function the Overview page uses, so the two screens can never
// disagree about what is wrong. This page used to hold five invented alerts
// ("Myntra settlement 19 days overdue, ₹5.2 L") naming a marketplace this
// store doesn't sell on, with tab counts hardcoded to match.

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
        const [ladderRes, contributionRes, freshnessRes, productsRes, burnRes] = await Promise.all([
          fetch(`${api}/metrics/revenue-ladder${dateQuery}`, authed),
          fetch(`${api}/metrics/contribution-margin${dateQuery}`, authed),
          fetch(`${api}/metrics/freshness`, authed),
          fetch(`${api}/metrics/product-profitability${dateQuery}`, authed),
          fetch(`${api}/metrics/burn-runway`, authed),
        ]);
        if (cancelled) return;
        if (![ladderRes, contributionRes, freshnessRes, productsRes, burnRes].some((r) => r.ok)) {
          setFailed(true);
          return;
        }
        setPayloads({
          ladder: ladderRes.ok ? await ladderRes.json() : null,
          contribution: contributionRes.ok ? await contributionRes.json() : null,
          freshness: freshnessRes.ok ? await freshnessRes.json() : null,
          products: productsRes.ok ? await productsRes.json() : null,
          burn: burnRes.ok ? await burnRes.json() : null,
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

  const alerts = payloads ? deriveAnomalies(payloads) : [];
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
                key={a.title}
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
      </div>
    </>
  );
}
