"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import Metric from "@/components/ui/Metric";
import MetricSkeleton from "@/components/ui/MetricSkeleton";
import NoDataPanel from "@/components/ui/NoDataPanel";
import StatusBadge from "@/components/ui/StatusBadge";
import TableSkeleton from "@/components/ui/TableSkeleton";
import DataFreshnessBadge from "@/components/ui/DataFreshnessBadge";
import { useDateRange } from "@/components/controls/DateRangeContext";
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


export default function ExpensesPage() {
  const { getToken } = useAuth();
  const { query: dateQuery, key: dateKey, preset: datePreset, ready: dateReady } = useDateRange();

  const [adSpend, setAdSpend] = useState(null);
  const [payables, setPayables] = useState(null);
  const [contribution, setContribution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Captured when the data lands rather than read during render: `new Date()`
  // in a render body is impure (react-hooks/purity) and would also mean two
  // rows could be compared against two different "todays" mid-paint.
  const [asOfDate, setAsOfDate] = useState(null);

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
        const [adRes, payRes, cRes] = await Promise.all([
          fetch(`${api}/metrics/ad-spend${dateQuery}`, authed),
          fetch(`${api}/metrics/payables`, authed),
          fetch(`${api}/metrics/contribution-margin${dateQuery}`, authed),
        ]);
        if (cancelled) return;
        if (!adRes.ok && !payRes.ok && !cRes.ok) {
          setFailed(true);
          return;
        }
        setAdSpend(adRes.ok ? await adRes.json() : null);
        setPayables(payRes.ok ? await payRes.json() : null);
        setContribution(cRes.ok ? await cRes.json() : null);
        setAsOfDate(new Date().toISOString().slice(0, 10));
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

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            <>
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
            </>
          ) : (
            <>
              {/* Deliberately NOT a "total expenses" card. A total across
                  categories where three of four have no source would be a
                  number that looks complete and isn't — the single most
                  misleading shape available on this page. */}
              <Metric
                label="Ad spend"
                value={hasAdSpend ? (adSpend.mixedCurrency ? "Multiple currencies" : rupeesShort(adSpend.value)) : "No data"}
                change={hasAdSpend ? `${adSpend.dayCount} days of data` : "Connect an ad account"}
                tone={hasAdSpend ? "warning" : "neutral"}
                sub={hasAdSpend ? "Meta Ads + Google Ads, real spend" : "Needs Meta Ads or Google Ads"}
              />
              <Metric
                label="Product cost (COGS)"
                value={hasCogs ? rupeesShort(cogsLayer.amount) : "No data"}
                change={cogsCoverage ? `${cogsCoverage.valueCoveragePct}% of lines costed` : "Enter product costs"}
                tone={cogsCoverage && cogsCoverage.valueCoveragePct >= 95 ? "positive" : "warning"}
                sub={
                  hasCogs
                    ? "Only the costed share — the rest is not counted, not assumed zero"
                    : "Needs landed costs on the Product costs page"
                }
              />
              <Metric
                label="Vendor bills unpaid"
                value={hasPayables ? rupeesShort(payables.totalOutstanding) : "No data"}
                change={hasPayables ? `${payables.billCount} open bills` : "Connect accounting"}
                tone={hasPayables && payables.overdueCount > 0 ? "negative" : "neutral"}
                sub={hasPayables ? `${payables.overdueCount} overdue` : "Needs Zoho Books"}
              />
              <Metric
                label="Due in the next 7 days"
                value={hasPayables ? rupeesShort(payables.dueNext7) : "No data"}
                change={hasPayables ? `${payables.dueNext7Count} bills` : "Connect accounting"}
                tone="neutral"
                sub={hasPayables ? "From vendor bills with a due date" : "Needs Zoho Books"}
              />
            </>
          )}
        </div>

        <NoDataPanel
          title="Expenses by category"
          reason="Categorised spend needs an accounting system — payroll, rent and operating costs never touch Shopify, and nothing else can see them. Ad spend and product cost are visible above; the rest of the picture isn't."
          action="Connect Zoho Books"
          href="/connections"
        />

        <div className="gcard p-5">
          <div className="mb-2.5 text-base font-medium text-foreground">Upcoming vendor bills</div>
          {loading ? (
            <table className="table">
              <thead>
                <tr><th>Vendor</th><th>Bill</th><th>Amount</th><th>Due</th><th>Status</th></tr>
              </thead>
              <TableSkeleton rows={5} columns={5} />
            </table>
          ) : upcoming.length > 0 ? (
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
