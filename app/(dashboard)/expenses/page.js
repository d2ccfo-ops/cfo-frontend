"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import Metric from "@/components/ui/Metric";
import DataStatusBadge from "@/components/ui/DataStatusBadge";
import MetricSkeleton from "@/components/ui/MetricSkeleton";
import NoDataPanel from "@/components/ui/NoDataPanel";
import StatusBadge from "@/components/ui/StatusBadge";
import TableSkeleton from "@/components/ui/TableSkeleton";
import DataFreshnessBadge from "@/components/ui/DataFreshnessBadge";
import { useDateRange } from "@/components/controls/DateRangeContext";
import { loadProgressively } from "@/components/lib/progressiveLoad";
import { formatInrShort as rupeesShort } from "@/lib/money";

// This page used to list seven invented vendor bills — "RK Packaging Pvt Ltd,
// ₹2.8 L, Due in 2 days" — against a vendor_bills table with zero rows, and a
// five-bar category chart with no source behind any bar.
//
// Every figure here is now fetched. Today most of them will report that they
// have no source, because ad_spend, expenses and vendor_bills are all empty —
// but they are WIRED, so connecting Meta Ads or Zoho Books lights them up with
// no further work rather than leaving a mock in place that looks the same
// either way.

// One key per request. Payables is by far the dearest of the four (it reads
// the whole vendor-bill ledger and builds the ageing ladder); ad-spend answers
// in a fraction of the time. Under the old Promise.all every card on the page
// moved at the ledger's speed, so each card now gates on its own key instead.
const LOAD_KEYS = ["adSpend", "payables", "contribution", "adEfficiency"];

export default function ExpensesPage() {
  const { getToken } = useAuth();
  const { query: dateQuery, key: dateKey, preset: datePreset, ready: dateReady } = useDateRange();

  const [adSpend, setAdSpend] = useState(null);
  const [payables, setPayables] = useState(null);
  const [contribution, setContribution] = useState(null);
  const [adEfficiency, setAdEfficiency] = useState(null);
  // Which sources have not answered yet. A key still in here means "unknown",
  // which renders as a skeleton — never as "No data", which would blame a
  // missing connector for what is only a slow request.
  const [pending, setPending] = useState(() => new Set(LOAD_KEYS));
  const [failed, setFailed] = useState(false);
  // Captured when the data lands rather than read during render: `new Date()`
  // in a render body is impure (react-hooks/purity) and would also mean two
  // rows could be compared against two different "todays" mid-paint.
  const [asOfDate, setAsOfDate] = useState(null);

  useEffect(() => {
    if (!dateReady) return;
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      // Back to skeletons for every card. Without this reset the last period's
      // figures would sit under the new period's heading until each request
      // returned — silently mislabelled, and the slower the endpoint the longer
      // the lie stands.
      setPending(new Set(LOAD_KEYS));
      setFailed(false);
      const failures = new Set();
      const setters = {
        adSpend: setAdSpend,
        payables: setPayables,
        contribution: setContribution,
        adEfficiency: setAdEfficiency,
      };
      try {
        const token = await getToken();
        const authed = { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal };
        const api = process.env.NEXT_PUBLIC_API_URL;
        await loadProgressively(
          [
            { key: "adSpend", url: `${api}/metrics/ad-spend${dateQuery}`, apply: setAdSpend },
            {
              key: "payables",
              url: `${api}/metrics/payables`,
              apply: (data) => {
                setPayables(data);
                // Stamped with the bills, not with the page load: the table
                // derives per-bill overdue from this date, so it has to be the
                // "today" that the bills themselves were read against.
                setAsOfDate(new Date().toISOString().slice(0, 10));
              },
            },
            { key: "contribution", url: `${api}/metrics/contribution-margin${dateQuery}`, apply: setContribution },
            { key: "adEfficiency", url: `${api}/metrics/ad-efficiency${dateQuery}`, apply: setAdEfficiency },
          ],
          {
            init: authed,
            isCancelled: () => cancelled,
            onSettled: (key, ok) => {
              if (!ok) {
                failures.add(key);
                // The old code assigned null to every endpoint that failed. That
                // still matters: leaving the last value in place would drop the
                // skeleton and hand the new period the previous period's number.
                setters[key](null);
              }
              setPending((p) => {
                const next = new Set(p);
                next.delete(key);
                return next;
              });
            },
          }
        );
        if (cancelled) return;
        // Same test as before: one dead endpoint is that card's own problem and
        // it says so itself. All three core metrics failing is the backend.
        if (failures.has("adSpend") && failures.has("payables") && failures.has("contribution")) {
          setFailed(true);
        }
      } catch {
        // Only the token call can land here — loadProgressively swallows its own
        // per-request errors — and without a token nothing on the page is live.
        // Clearing pending drops the skeletons: they promise an answer that is
        // no longer coming. The payloads have to be dropped with them. Nothing
        // else clears them — `pending` is what normally hides them — so on a
        // date-range change the cards would otherwise keep painting the PREVIOUS
        // period's ad spend, payables and margin under the new period's heading,
        // which the subtitle has already relabelled.
        if (!cancelled) {
          setFailed(true);
          setAdSpend(null);
          setPayables(null);
          setContribution(null);
          setAdEfficiency(null);
          setPending(new Set());
        }
      }
    }
    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [getToken, dateQuery, dateKey, dateReady]);

  const adSpendPending = pending.has("adSpend");
  const payablesPending = pending.has("payables");
  const contributionPending = pending.has("contribution");
  const adEfficiencyPending = pending.has("adEfficiency");

  // dayCount === 0 means no ads connector has ever pulled a row. "₹0 spent" and
  // "no ad account connected" are different statements and must not share a card.
  const hasAdSpend = adSpend && adSpend.dayCount > 0;
  const hasPayables = payables?.connected === true;
  const cogsLayer = contribution?.layers?.find((l) => l.key === "cogs");
  const cogsCoverage = contribution?.cogsCoverage;
  const hasCogs = cogsLayer?.hasSource === true && (cogsCoverage?.costedLines ?? 0) > 0;

  const upcoming = payables?.upcoming ?? [];

  return (
    <>
      <TopNav
        title="Expenses"
        subtitle={`Vendor bills, ad spend and product cost · ${datePreset.toLowerCase()}`}
        actions={<DataFreshnessBadge />}
      />

      <div className="flex flex-col gap-6">
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
            <strong className="font-medium">Couldn&apos;t reach cfo-backend.</strong> Nothing below is live.
          </div>
        ) : null}

        {/* Each card waits only on the request behind it. The two payables
            cards share one key because they are two readings of one response. */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Deliberately NOT a "total expenses" card. A total across
              categories where three of four have no source would be a
              number that looks complete and isn't — the single most
              misleading shape available on this page. */}
          {adSpendPending ? (
            <MetricSkeleton />
          ) : (
            <Metric
              label="Ad spend"
              value={hasAdSpend ? (adSpend.mixedCurrency ? "Multiple currencies" : rupeesShort(adSpend.value)) : "No data"}
              change={hasAdSpend ? `${adSpend.dayCount} days of data` : "Connect an ad account"}
              tone={hasAdSpend ? "warning" : "neutral"}
              sub={hasAdSpend ? "Meta Ads + Google Ads, real spend" : "Needs Meta Ads or Google Ads"}
            />
          )}
          {contributionPending ? (
            <MetricSkeleton />
          ) : (
            <Metric
              label="Product cost (COGS)"
              badge={<DataStatusBadge dataStatus={contribution?.dataStatus} />}
              value={hasCogs ? rupeesShort(cogsLayer.amount) : "No data"}
              // "% of line VALUE" — this figure weights by rupees, not row
              // count; calling it "lines" overstated nothing but confused
              // anyone comparing it to the Costs page's line coverage.
              change={cogsCoverage ? `${cogsCoverage.valueCoveragePct}% of line value costed` : "Enter product costs"}
              tone={cogsCoverage && cogsCoverage.valueCoveragePct >= 95 ? "positive" : "warning"}
              sub={
                hasCogs
                  ? "Only the costed share — the rest is not counted, not assumed zero"
                  : "Needs landed costs on the Product costs page"
              }
            />
          )}
          {payablesPending ? (
            <MetricSkeleton />
          ) : (
            <Metric
              label="Vendor bills unpaid"
              value={hasPayables ? rupeesShort(payables.totalOutstanding) : "No data"}
              change={hasPayables ? `${payables.billCount} open bills` : "Connect accounting"}
              tone={hasPayables && payables.overdueCount > 0 ? "negative" : "neutral"}
              sub={hasPayables ? `${payables.overdueCount} overdue` : "Needs Zoho Books"}
            />
          )}
          {payablesPending ? (
            <MetricSkeleton />
          ) : (
            <Metric
              label="Due in the next 7 days"
              value={hasPayables ? rupeesShort(payables.dueNext7) : "No data"}
              change={hasPayables ? `${payables.dueNext7Count} bills` : "Connect accounting"}
              tone="neutral"
              sub={hasPayables ? "From vendor bills with a due date" : "Needs Zoho Books"}
            />
          )}
        </div>

        {/* Marketing efficiency + per-platform split. ROAS/CAC were computed
            all along and rendered only on the Overview; a founder deciding
            where next month's budget goes does it from THIS page. The split
            states Google's absence explicitly instead of folding it into a
            blended total that reads as "all platforms accounted for". */}
        {/* Whether this card exists at all is ad-spend's answer to give, so it
            waits on that key only. ROAS and CAC come from a second request and
            carry their own skeletons — "—" from a request still in flight would
            read as "we looked and there is no ratio". */}
        {!adSpendPending && hasAdSpend ? (
          <div className="gcard p-5">
            <div className="mb-2.5 text-base font-medium text-foreground">Marketing efficiency</div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-[12px] uppercase tracking-[0.06em] text-muted-foreground">ROAS</div>
                <div className="text-xl font-semibold text-foreground">
                  {adEfficiencyPending ? (
                    <span className="block h-7 w-20 animate-pulse rounded-sm bg-primary/10" role="status" aria-busy="true" />
                  ) : adEfficiency?.roas != null ? `${adEfficiency.roas}x` : "—"}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {adEfficiencyPending ? (
                    <span className="block h-4 w-56 animate-pulse rounded-sm bg-primary/10" role="status" aria-busy="true" />
                  ) : adEfficiency?.incomparableCurrency
                    ? "Ad account bills in a non-INR currency — ratio withheld rather than computed across currencies"
                    : "Net revenue per rupee of ad spend"}
                </div>
              </div>
              <div>
                <div className="text-[12px] uppercase tracking-[0.06em] text-muted-foreground">Blended CAC</div>
                <div className="text-xl font-semibold text-foreground">
                  {adEfficiencyPending ? (
                    <span className="block h-7 w-24 animate-pulse rounded-sm bg-primary/10" role="status" aria-busy="true" />
                  ) : adEfficiency?.blendedCac != null ? rupeesShort(adEfficiency.blendedCac) : "—"}
                </div>
                <div className="text-[12px] text-muted-foreground">Ad spend per order, all orders — not per new customer</div>
              </div>
              <div>
                <div className="text-[12px] uppercase tracking-[0.06em] text-muted-foreground">Spend in period</div>
                <div className="text-xl font-semibold text-foreground">
                  {adSpend.mixedCurrency ? "Multiple currencies" : rupeesShort(adSpend.value)}
                </div>
                <div className="text-[12px] text-muted-foreground">{adSpend.dayCount} account-days of data</div>
              </div>
            </div>
            <div className="mt-4 flex flex-col">
              {(adSpend.byProvider ?? []).map((p) => (
                <div key={p.provider} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2 last:border-0">
                  <span className="text-[13px] text-foreground">{p.provider === "META_ADS" ? "Meta Ads" : p.provider === "GOOGLE_ADS" ? "Google Ads" : p.provider}</span>
                  {p.dayCount > 0 ? (
                    <span className="text-[13px] text-muted-foreground">
                      <span className="font-medium text-foreground">{p.mixedCurrency ? "Multiple currencies" : rupeesShort(p.value)}</span>
                      {" · "}{p.impressions.toLocaleString("en-IN")} impressions · {p.clicks.toLocaleString("en-IN")} clicks
                      {p.impressions > 0 ? ` · ${((p.clicks / p.impressions) * 100).toFixed(2)}% CTR` : ""}
                    </span>
                  ) : (
                    <span className="text-[13px]" style={{ color: "var(--color-accent)" }}>
                      no data — {p.provider === "GOOGLE_ADS" ? "re-export with the Day segment and upload" : "not connected"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <NoDataPanel
          title="Expenses by category"
          reason="Categorised spend needs an accounting system — payroll, rent and operating costs never touch Shopify, and nothing else can see them. Ad spend and product cost are visible above; the rest of the picture isn't."
          action="Connect Zoho Books"
          href="/connections"
        />

        <div className="gcard p-5">
          <div className="mb-2.5 text-base font-medium text-foreground">Upcoming vendor bills</div>
          {/* The full ageing ladder. The two cards above show only the ends of
              it (overdue, due-in-7); the middle buckets are where a payables
              problem builds before it becomes an overdue number. */}
          {!payablesPending && hasPayables && (payables.ageing ?? []).length > 0 ? (
            <div className="mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {payables.ageing.map((b) => (
                <div key={b.key} className="rounded-md bg-muted/50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">{b.label}</div>
                  <div
                    className="text-[15px] font-medium tabular-nums"
                    style={b.key === "overdue" && b.count > 0 ? { color: "var(--color-destructive)" } : undefined}
                  >
                    {rupeesShort(b.amount)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {b.count.toLocaleString("en-IN")} bill{b.count === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {/* The backend states its own blind spots (multi-currency totals,
              bills with no due date); hiding them would make the ladder above
              read as complete when it is not. */}
          {!payablesPending && hasPayables && (payables.warnings ?? []).length > 0 ? (
            <div className="mb-3 flex flex-col gap-1">
              {payables.warnings.map((w) => (
                <p key={w} className="text-[12px]" style={{ color: "var(--color-accent)" }}>{w}</p>
              ))}
            </div>
          ) : null}
          {payablesPending ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Vendor</th><th>Bill</th><th>Amount</th><th>Due</th><th>Status</th></tr>
                </thead>
                <TableSkeleton rows={5} columns={5} />
              </table>
            </div>
          ) : upcoming.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Vendor</th><th>Bill</th><th>Amount</th><th>Due</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {upcoming.map((b, i) => {
                    // The API sends no per-bill overdue flag, so it is derived
                    // from the due date against the moment the data loaded.
                    // Reading a missing field would have rendered "Scheduled" for
                    // every bill, including the late ones.
                    const overdue = asOfDate !== null && b.dueDate < asOfDate;
                    return (
                      <tr key={`${b.billNumber}-${i}`}>
                        <td>{b.vendorName}</td>
                        <td>{b.billNumber}</td>
                        <td>{b.currency && b.currency !== "INR" ? `${b.currency} ${b.balance.toLocaleString("en-IN")}` : rupeesShort(b.balance)}</td>
                        <td>{b.dueDate}</td>
                        <td><StatusBadge status={overdue ? "negative" : "neutral"} label={overdue ? "Overdue" : "Scheduled"} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              {hasPayables
                ? "No bills due — every vendor bill on file is settled."
                : "No accounting system is connected, so there are no vendor bills to show. Connecting Zoho Books fills this in."}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
