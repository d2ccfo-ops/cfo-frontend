"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import AlertCard from "@/components/ui/AlertCard";
import NoDataPanel from "@/components/ui/NoDataPanel";
import ExceptionTaxonomy from "@/components/cards/ExceptionTaxonomy";
import { useDateRange } from "@/components/controls/DateRangeContext";
import { loadProgressively } from "@/components/lib/progressiveLoad";
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

// The seven sources, fired together rather than behind a Promise.all barrier.
// They answer at wildly different speeds — /anomalies reads persisted rows,
// while the reconciliation summary aggregates shipment status across the whole
// org — and the taxonomy at the bottom of the page shares nothing with the
// alerts above it, so it has no business waiting for them.
const REQUEST_KEYS = ["anomalies", "ladder", "contribution", "freshness", "burn", "recon", "taxonomy"];

// SIX OF THE SEVEN FEED ONE MERGED LIST, so they are gated as a group. The
// alerts are counted ("All (5) · Critical (2)") and offered an all-clear
// panel, and both of those are claims about the WHOLE set: a count taken while
// three sources are still answering is simply wrong, and "Nothing flagged" said
// over an in-flight request is the exact false all-clear the banner below warns
// about. Individual alert cards still paint as they arrive — see the skeleton
// tail in the list — but nothing that summarises them appears until every
// contributing source has settled.
const ALERT_KEYS = ["anomalies", "ladder", "contribution", "freshness", "burn", "recon"];

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
  const [payloads, setPayloads] = useState({});
  // Which sources have not answered yet. A card reads this rather than a
  // page-level flag, so a slow source delays only itself.
  const [pending, setPending] = useState(() => new Set(REQUEST_KEYS));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!dateReady) return;
    let cancelled = false;
    // Superseded requests are aborted rather than merely ignored: seven of
    // these run at once, and a reader walking the date picker back three
    // months should not leave twenty-one aggregations running server-side.
    const controller = new AbortController();
    async function load() {
      setFailed(false);
      // Back to skeletons, and the previous period's answers discarded. A
      // payload kept across a date change would be read by deriveSystemHealth
      // as this period's — and a source that fails in the new load would go on
      // reporting the old period's figure under the new heading.
      setPending(new Set(REQUEST_KEYS));
      setPayloads({});
      try {
        const token = await getToken();
        const authed = { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal };
        const api = process.env.NEXT_PUBLIC_API_URL;
        // Functional update: these land in whatever order the network decides.
        const apply = (key) => (data) => setPayloads((prev) => ({ ...prev, [key]: data }));
        const { ok } = await loadProgressively(
          [
            // §17 anomalies. Not date-filtered: the engine runs on its own
            // trailing-28-day window and stores the period on each row, so
            // scoping this to the page's picker would silently hide findings
            // whose window doesn't line up with it.
            { key: "anomalies", url: `${api}/anomalies`, apply: apply("anomalies") },
            { key: "ladder", url: `${api}/metrics/revenue-ladder${dateQuery}`, apply: apply("ladder") },
            { key: "contribution", url: `${api}/metrics/contribution-margin${dateQuery}`, apply: apply("contribution") },
            { key: "freshness", url: `${api}/metrics/freshness`, apply: apply("freshness") },
            { key: "burn", url: `${api}/metrics/burn-runway`, apply: apply("burn") },
            // Money-shaped exceptions (dark COD, unmatched payments, freight
            // orphans) live in the reconciliation summary.
            { key: "recon", url: `${api}/reconciliation/summary${dateQuery}`, apply: apply("recon") },
            // P6.4. The §15 taxonomy — eleven named kinds of reconciliation
            // exception, derived server-side. Distinct from the anomalies
            // above: an anomaly is a metric that MOVED, an exception is money
            // whose whereabouts do not add up.
            { key: "taxonomy", url: `${api}/reconciliation/exceptions${dateQuery}`, apply: apply("taxonomy") },
          ],
          {
            init: authed,
            isCancelled: () => cancelled,
            onSettled: (key) =>
              setPending((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
              }),
          }
        );
        // Bookkeeping only; nothing on screen waited for this promise. Every
        // request failing is a connection failure. Some failing is not — that
        // is a source with nothing to say, and its own section says so.
        if (!cancelled && ok === 0) setFailed(true);
      } catch {
        if (cancelled) return;
        setFailed(true);
        // Nothing was ever in flight (the token call threw), so nothing should
        // keep pretending to load underneath the error.
        setPending(new Set());
      }
    }
    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [getToken, dateQuery, dateKey, dateReady]);

  const alertsPending = ALERT_KEYS.some((k) => pending.has(k));

  // Server findings first — they are the persisted, auditable ones, and a
  // founder scanning top-down should hit those before pipeline warnings.
  const alerts = [...toAlerts(payloads.anomalies), ...deriveSystemHealth(payloads)];
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

        {alertsPending ? null : (
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
          {visible.map((a) => (
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
          ))}

          {alertsPending ? (
            // Three rows while the page is still blank, one trailing row once
            // findings are on screen: the tail's job there is to say "sources
            // are still answering", not to imply a number of alerts nobody has
            // counted yet.
            <>
              <AlertSkeleton />
              {visible.length === 0 ? (
                <>
                  <AlertSkeleton />
                  <AlertSkeleton />
                </>
              ) : null}
            </>
          ) : visible.length > 0 || failed ? null : alerts.length === 0 ? (
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
        <ExceptionTaxonomy report={payloads.taxonomy ?? null} loading={pending.has("taxonomy")} />
      </div>
    </>
  );
}
