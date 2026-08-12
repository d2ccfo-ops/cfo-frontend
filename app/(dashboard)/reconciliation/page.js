"use client";

import Link from "next/link";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";
import DateRangePicker from "@/components/controls/DateRangePicker";
import { useDateRange } from "@/components/controls/DateRangeContext";
import TopNav from "@/components/layout/TopNav";
import Metric from "@/components/ui/Metric";
import DataStatusBadge from "@/components/ui/DataStatusBadge";
import ReconciliationTable, { formatPaise } from "@/components/tables/ReconciliationTable";
import EvidenceDrawer from "@/components/ui/EvidenceDrawer";
import PairDialog from "@/components/ui/PairDialog";
import TableSkeleton from "@/components/ui/TableSkeleton";

// Reconciliation answers "did the money arrive", which is a different question
// from "what did we sell" — the revenue ladder already answers that exactly.
// Every number on this page comes from cfo-backend's modules/calc/
// reconciliation.ts; nothing here is invented, and where a leg of the chain has
// no data source, the page says so rather than showing a zero that reads as a
// result.

const PAGE_SIZE = 100;
const PREFETCH_MARGIN_PX = 600;
const SEARCH_DEBOUNCE_MS = 350;

const LEG_LABELS = {
  ORDER_PAYMENT: "Order → payment",
  PAYMENT_SETTLEMENT: "Payment → settlement",
  SETTLEMENT_BANK: "Settlement → bank",
  COD_REMITTANCE: "COD → bank",
  // The only leg where the money goes OUT rather than coming in, which is why
  // it reads backwards from the others: a refund we issued should appear in a
  // payout as a deduction, and one that doesn't is money the store believes it
  // returned and the gateway has no record of.
  REFUND_PAYMENT: "Refund → settlement",
  // The only leg that checks a COST rather than a receipt, so it is worded as
  // a charge: "was this parcel actually billed to us, and for what".
  SHIPMENT_FREIGHT: "Shipment → courier invoice",
};

function formatPct(pct) {
  if (pct === null || pct === undefined) return "—";
  return `${pct.toFixed(1)}%`;
}

export default function ReconciliationPage() {
  const { getToken } = useAuth();
  // The period comes from the shared header control (components/controls/
  // DateRangeContext), not from state of this page's own. The picker rendered
  // in the filter row below is that same control, so the header pill and the
  // in-page pill can never disagree about which window the numbers describe.
  const { range: dateRange, key: dateKey, preset: datePreset, ready: dateReady } = useDateRange();

  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState("");
  const [runResult, setRunResult] = useState(null);
  const [running, setRunning] = useState(false);

  const [items, setItems] = useState(null); // null = loading, [] = loaded empty
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [writingOffId, setWritingOffId] = useState(null);
  // §22 (P5.2). A write-off above the materiality threshold does not
  // happen — it becomes a request. Held here so the table can say so
  // rather than appearing to have done nothing.
  const [approvalNotice, setApprovalNotice] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  // P6.3. Manual pairing — the row being paired, and the row whose pairing
  // is being undone.
  const [pairRow, setPairRow] = useState(null);
  const [unpairingId, setUnpairingId] = useState(null);

  const [filters, setFilters] = useState({
    searchInput: "",
    search: "",
    status: "all",
    channel: "all",
    paymentMode: "all",
  });

  const [drawer, setDrawer] = useState({ open: false, title: "", sourceLabel: "", rows: [] });

  // Bumped after a run so the list refetches from page one. Filter state is
  // unchanged by a run, so without this the fetch effect's dependencies are
  // all identical and it never fires — the table would keep showing matches
  // from before the run that just changed them.
  const [reloadKey, setReloadKey] = useState(0);

  const fetchingRef = useRef(false);
  const sentinelRef = useRef(null);

  // Debounced so typing an order number doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.search === f.searchInput.trim() ? f : { ...f, search: f.searchInput.trim() })), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filters.searchInput]);

  // Returns the result rather than setting state, so the effect below can do
  // its setState inside an async callback. `react-hooks/set-state-in-effect`
  // rejects a state-setting call in an effect BODY even when the function is
  // async and nothing lands synchronously — and it is right to, since the
  // static shape is what makes cascading renders possible.
  const fetchSummary = useCallback(async () => {
    try {
      const token = await getToken();
      const query = dateRange ? `?from=${dateRange.from}&to=${dateRange.to}` : "";
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/reconciliation/summary${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { error: "Couldn't load the reconciliation summary." };
      return { data: await res.json() };
    } catch {
      return { error: "Couldn't reach the backend." };
    }
    // dateKey rather than dateRange: the object is rebuilt on every context
    // render, the string changes only when the window really moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken, dateKey]);

  useEffect(() => {
    // Held until the stored period has been read back, so a reload doesn't
    // fetch month-to-date, paint it, then immediately refetch the real window.
    if (!dateReady) return;
    let cancelled = false;
    fetchSummary().then((result) => {
      if (cancelled) return;
      if (result.error) setSummaryError(result.error);
      else {
        setSummary(result.data);
        setSummaryError("");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchSummary, reloadKey, dateReady]);

  const buildUrl = useCallback(
    (cursor) => {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.channel !== "all") params.set("channel", filters.channel);
      if (filters.paymentMode !== "all") params.set("paymentMode", filters.paymentMode);
      // Same window the summary cards above were computed on. Omitted entirely
      // for the default period, which is what makes "no filter" and "month to
      // date" the identical request the backend already treats as one.
      if (dateRange) {
        params.set("from", dateRange.from);
        params.set("to", dateRange.to);
      }
      params.set("limit", String(PAGE_SIZE));
      if (cursor) params.set("cursor", cursor);
      return `${process.env.NEXT_PUBLIC_API_URL}/reconciliation/items?${params.toString()}`;
    },
    // reloadKey is not used in the URL — it is here so that bumping it gives
    // buildUrl a new identity, which is what makes the first-page effect below
    // re-run after a reconciliation pass. dateKey does the same job for the
    // period, and is the stable string form of dateRange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.search, filters.status, filters.channel, filters.paymentMode, reloadKey, dateKey]
  );

  // First page, refetched whenever a filter changes. Resetting the accumulated
  // list here is what stops two different filters' results being concatenated.
  useEffect(() => {
    if (!dateReady) return;
    let cancelled = false;
    async function loadFirstPage() {
      fetchingRef.current = true;
      setItems(null);
      setLoadFailed(false);
      try {
        const token = await getToken();
        const res = await fetch(buildUrl(null), { headers: { Authorization: `Bearer ${token}` } });
        if (cancelled) return;
        if (!res.ok) {
          setLoadFailed(true);
          setItems([]);
          return;
        }
        const data = await res.json();
        setItems(data.items);
        setNextCursor(data.nextCursor ?? null);
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
          setItems([]);
        }
      } finally {
        fetchingRef.current = false;
      }
    }
    loadFirstPage();
    return () => {
      cancelled = true;
    };
  }, [getToken, buildUrl, dateReady]);

  const loadNextPage = useCallback(async () => {
    if (fetchingRef.current || !nextCursor) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    try {
      const token = await getToken();
      const res = await fetch(buildUrl(nextCursor), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        // Appended, never merged: keyset paging guarantees the server won't
        // repeat a row, so there is no de-duplication to do.
        setItems((cur) => [...(cur ?? []), ...data.items]);
        setNextCursor(data.nextCursor ?? null);
      } else {
        setLoadFailed(true);
      }
    } catch {
      setLoadFailed(true);
    } finally {
      fetchingRef.current = false;
      setLoadingMore(false);
    }
  }, [getToken, buildUrl, nextCursor]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadNextPage();
      },
      { rootMargin: `${PREFETCH_MARGIN_PX}px` }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nextCursor, loadNextPage]);

  async function handleRun() {
    setRunning(true);
    setRunResult(null);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/reconciliation/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setRunResult(await res.json());
        // Bumping this refetches both the summary and the first page of items —
        // a run is exactly the thing that changes what both of them say.
        setReloadKey((k) => k + 1);
      } else {
        setSummaryError("The reconciliation run failed.");
      }
    } catch {
      setSummaryError("Couldn't reach the backend.");
    } finally {
      setRunning(false);
    }
  }

  // P6.3. Pairing does not patch the row from a known new state the way
  // write-off does — the server re-derives status, confidence and the settled
  // column together, and guessing at "matched" here could disagree with what a
  // reload shows.
  async function handlePaired() {
    const refreshedSummary = await fetchSummary();
    if (refreshedSummary.data) setSummary(refreshedSummary.data);
    // Refetch from page one rather than patching: the server re-derives
    // status, confidence and the settled column together, and a guess here
    // could disagree with what a reload shows.
    setReloadKey((k) => k + 1);
  }

  async function handleUnpair(row) {
    setUnpairingId(row.id);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/reconciliation/items/${row.id}/unpair`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const refreshedSummary = await fetchSummary();
        if (refreshedSummary.data) setSummary(refreshedSummary.data);
        await reload();
      }
    } finally {
      setUnpairingId(null);
    }
  }

  async function handleRestore(row) {
    setRestoringId(row.id);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/reconciliation/items/${row.id}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        // The backend re-derived the row from the evidence (and re-ran the
        // engine), so this patch is its real current state — matched if a
        // payment exists, unmatched if not.
        const fresh = await res.json();
        setItems((cur) => (cur ?? []).map((r) => (r.id === row.id ? { ...r, ...fresh } : r)));
        const refreshed = await fetchSummary();
        if (refreshed.data) setSummary(refreshed.data);
      }
    } finally {
      setRestoringId(null);
    }
  }

  async function handleWriteOff(row) {
    setWritingOffId(row.id);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/reconciliation/items/${row.id}/write-off`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note: "Written off from the reconciliation table" }),
      });
      const body = await res.json().catch(() => null);

      // 202 means the server did NOT write anything off — the amount is above
      // this organisation's materiality threshold, so §22 sent it to a second
      // person instead. Patching the row as written-off here would show a
      // decision that has not been made.
      if (res.status === 202) {
        setApprovalNotice({
          orderNumber: row.orderNumber,
          message: body?.message ?? "This write-off needs approval.",
          requiredRole: body?.requiredRole ?? null,
          riskLevel: body?.riskLevel ?? null,
        });
        return;
      }

      if (res.status === 409 && body?.error === "approval_pending") {
        setApprovalNotice({
          orderNumber: row.orderNumber,
          message: body.message ?? "A write-off for this order is already waiting for approval.",
          requiredRole: null,
          riskLevel: null,
        });
        return;
      }

      if (res.ok) {
        // Patched in place rather than refetching the page: the row's new state
        // is fully known, and reloading would jump a reader who has scrolled
        // several pages deep back to the top.
        setItems((cur) =>
          (cur ?? []).map((r) =>
            r.id === row.id ? { ...r, status: "written_off", matchMethod: "Written off — manual" } : r
          )
        );
        const refreshed = await fetchSummary();
        if (refreshed.data) setSummary(refreshed.data);
      }
    } finally {
      setWritingOffId(null);
    }
  }

  const openEvidence = (row) => {
    setDrawer({
      open: true,
      title: `Evidence: ${row.orderNumber}`,
      sourceLabel: `${row.channel} order, reconciled against payment records`,
      rows: [
        { label: "Order number", value: row.orderNumber },
        { label: "Channel", value: row.channel },
        { label: "Payment mode", value: row.paymentMode ?? "Unknown" },
        { label: "Placed", value: new Date(row.placedAt).toLocaleString("en-IN") },
        { label: "Expected (order total)", value: formatPaise(row.expected) },
        { label: "Received (payment)", value: formatPaise(row.received) },
        { label: "Difference", value: row.difference === null ? "—" : formatPaise(row.difference) },
        { label: "How it was matched", value: row.matchMethod },
        { label: "Match strength", value: row.confidence ?? "Not matched" },
        // The independent corroboration, kept separate from the match above:
        // everything before this line comes from Shopify checking Shopify.
        // This is a third party stating it moved money, and naming the
        // transfer it moved it in.
        ...(row.settlement
          ? [
              { label: "—", value: "Provider settlement" },
              { label: "Settled to you", value: formatPaise(row.settlement.netAmount) },
              { label: "Gross settled", value: formatPaise(row.settlement.grossAmount) },
              { label: "Provider fee", value: formatPaise(row.settlement.feeAmount) },
              {
                label: "Payout date",
                value: row.settlement.settledAt
                  ? new Date(row.settlement.settledAt).toLocaleDateString("en-IN")
                  : "Not stated",
              },
              { label: "Bank reference (UTR)", value: row.settlement.utr ?? "Not stated" },
              // A PPCOD deposit settles ₹21 of a ₹1,498 order. Saying so here
              // stops "settled" being read as "paid in full".
              ...(row.settlement.grossAmount !== row.expected
                ? [
                    {
                      label: "Covers the whole order?",
                      value:
                        "No — this payout covers only part of the order total. The rest settles through another route (COD cash, or a later payout).",
                    },
                  ]
                : []),
            ]
          : [
              {
                label: "Provider settlement",
                value:
                  "No settlement statement covers this order yet — a payout statement states which orders were in which transfer, and none imported so far includes this one.",
              },
            ]),
        // The full audit trail for a staff-raised invoice. Every field here is
        // read straight from the Shopify order payload — none of it is
        // inferred, which is why the staff member appears as the numeric id
        // Shopify actually sends rather than a name guessed from the tags.
        ...(row.invoice
          ? [
              { label: "—", value: "Invoice details" },
              { label: "Raised", value: row.invoice.raisedInAdmin ? "In the Shopify admin, from a draft order" : `Source: ${row.invoice.sourceName ?? "unknown"}` },
              ...(row.invoice.staffUserId ? [{ label: "Raised by (Shopify staff ID)", value: row.invoice.staffUserId }] : []),
              { label: "Billed to", value: row.invoice.customerName || "Not recorded" },
              { label: "Customer email", value: row.invoice.customerEmail || "Not recorded" },
              { label: "Payment terms", value: row.invoice.termsName ?? "Set, unnamed" },
              { label: "When it's due", value: row.invoice.dueDescription },
              ...(row.invoice.outstanding ? [{ label: "Outstanding per Shopify", value: `₹${row.invoice.outstanding}` }] : []),
              ...(row.invoice.confirmationNumber ? [{ label: "Order confirmation sent", value: `#${row.invoice.confirmationNumber} — emailed to the customer` }] : []),
              ...(row.invoice.tags.length ? [{ label: "Order tags", value: row.invoice.tags.join(", ") }] : []),
              { label: "Why this isn't a failure", value: "No checkout payment was ever expected — the money is owed on the terms above, so this is a receivable, not a lost payment" },
            ]
          : []),
        ...(row.note ? [{ label: "Note", value: row.note }] : []),
      ],
    });
  };

  const auto = summary?.autoMatched;
  const byStatus = summary?.byStatus;
  // All-time COD position; falls back to the period block if the API predates it.
  const codPos = summary?.codPosition ?? summary?.cod;
  const channels = summary?.channels ?? [];
  const hasInvoiced = (byStatus?.invoiced?.count ?? 0) > 0;

  // "Custom range" names no period at all, so the dates themselves are the
  // label — otherwise the one selection a reader had to type out by hand is
  // the one the page refuses to read back to them.
  const periodLabel =
    datePreset === "Custom range" && dateRange
      ? `${dateRange.from} to ${dateRange.to}`
      : datePreset.toLowerCase();

  return (
    <>
      {/* §22. A write-off above the threshold did NOT happen — it became a
          request. Said plainly, because the alternative reading of a button
          that changed nothing is that the button is broken. */}
      {approvalNotice ? (
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-accent-soft px-3.5 py-3 text-[13px] text-accent"
          role="status"
        >
          <span>
            <strong className="font-medium">Order {approvalNotice.orderNumber} was not written off.</strong>{" "}
            {approvalNotice.message}
            {approvalNotice.requiredRole ? ` It needs ${approvalNotice.requiredRole} or above to approve.` : ""}
          </span>
          <span className="flex items-center gap-3">
            <Link href="/approvals" className="font-medium underline">
              Open approvals
            </Link>
            <button type="button" className="cursor-pointer border-none bg-transparent p-0 text-current" onClick={() => setApprovalNotice(null)}>
              Dismiss
            </button>
          </span>
        </div>
      ) : null}

      <TopNav
        title="Reconciliation"
        // Every card and row below is scoped to this window, so it is named
        // here rather than left to the reader to infer from a pill elsewhere.
        subtitle={`Trace every order through to money actually received · ${periodLabel}`}
        actions={
          <div className="flex items-center gap-3">
            {/* Without this, the always-present chain below can be mistaken for
                stale output of some long-ago run. */}
            {summary?.lastRunAt ? (
              <span className="text-[12px] text-muted-foreground">
                last run {new Date(summary.lastRunAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
            <button className="btn btn-primary" type="button" onClick={handleRun} disabled={running}>
              {running ? "Running…" : "Run reconciliation"}
            </button>
          </div>
        }
      />

      <div className="flex flex-col gap-5">
        {summaryError ? (
          <p className="text-[13px]" style={{ color: "var(--color-destructive)" }}>{summaryError}</p>
        ) : null}

        {/* Five columns only when there are invoiced orders to report — a
            store that never raises invoices keeps the original four. */}
        <div className={`grid gap-4 sm:grid-cols-2 ${hasInvoiced ? "lg:grid-cols-3 xl:grid-cols-5" : "lg:grid-cols-4"}`}>
          <Metric
            label="Auto-matched"
            value={auto ? formatPct(auto.pctByCount) : "—"}
            change={auto ? formatPct(auto.pctByValue) : undefined}
            tone={auto && auto.pctByCount > 90 ? "positive" : "warning"}
            sub={auto ? `${auto.count.toLocaleString("en-IN")} of ${auto.eligibleCount.toLocaleString("en-IN")} prepaid orders — by value on the right` : "Prepaid orders"}
          />
          <Metric
            label="Needs review"
            value={byStatus ? byStatus.review.count.toLocaleString("en-IN") : "—"}
            change={byStatus ? formatPaise(byStatus.review.value) : undefined}
            tone="warning"
            sub="Matched, but the amounts disagree"
          />
          <Metric
            label="No payment found"
            value={byStatus ? byStatus.unmatched.count.toLocaleString("en-IN") : "—"}
            change={byStatus ? formatPaise(byStatus.unmatched.value) : undefined}
            tone={byStatus && byStatus.unmatched.count === 0 ? "positive" : "negative"}
            sub="Checkout orders with no matching payment"
          />
          {/* Invoices used to be counted above, in red, as failed payments —
              all 145 of them (₹15.19 L), when not one had actually failed.
              They are money owed on agreed terms, so they get their own card
              with their own tone. */}
          {hasInvoiced ? (
            <Metric
              label="Awaiting invoice payment"
              value={byStatus.invoiced.count.toLocaleString("en-IN")}
              change={formatPaise(byStatus.invoiced.value)}
              tone="warning"
              sub="Raised on payment terms — owed, not failed"
            />
          ) : null}
          {/* With shipment data, the headline is the money the courier has
              ALREADY COLLECTED — that is the cash someone else is holding.
              All-COD-outstanding as the headline would bury it inside a much
              larger number that is mostly parcels still on trucks.
              COD cards read codPosition (all-time), not the period-scoped cod
              block: what a courier holds is a position, and scoping it to the
              picker made the default month show ₹0 over ₹72L of silent parcels. */}
          {codPos?.hasCourierData ? (
            <Metric
              label="COD collected by courier"
              badge={<DataStatusBadge dataStatus={summary?.codDataStatus} />}
              value={formatPaise(codPos.deliveredValue)}
              change={`${codPos.deliveredCount.toLocaleString("en-IN")} delivered`}
              tone="warning"
              sub={`Awaiting remittance · in flight ${formatPaise(codPos.inFlightValue)} · RTO ${formatPaise(codPos.rtoValue)} never collected${
                codPos.onlineDepositsValue && codPos.onlineDepositsValue !== "0"
                  ? ` · ${formatPaise(codPos.onlineDepositsValue)} PPCOD deposits already captured online (netted out)`
                  : ""
              }`}
            />
          ) : (
            <Metric
              label="COD awaiting remittance"
              value={byStatus ? byStatus.cod_pending.count.toLocaleString("en-IN") : "—"}
              change={byStatus ? formatPaise(byStatus.cod_pending.value) : undefined}
              tone="neutral"
              sub="No courier data — delivery status unknown"
            />
          )}
          {/* Parcels the courier has stopped reporting on. Neither collectible
              nor written off — the single largest number in the system, and it
              was invisible until this card. Rendered whenever courier data
              exists so a zero here reads as an all-clear, not as absence. */}
          {codPos?.hasCourierData ? (
            <Metric
              label="COD tracking gone dark"
              badge={<DataStatusBadge dataStatus={summary?.codDataStatus} />}
              value={formatPaise(codPos.unknownValue)}
              change={`${codPos.unknownCount.toLocaleString("en-IN")} parcels`}
              tone={codPos.unknownCount === 0 ? "positive" : "negative"}
              sub={
                codPos.unknownOldestDays !== null
                  ? `No scan in 30+ days — oldest silent ${codPos.unknownOldestDays} days. Ask the courier for a COD remittance MIS.`
                  : "Every COD parcel has reported a scan in the last 30 days."
              }
            />
          ) : null}
        </div>

        {/* The chain, and where it breaks. A leg with no data source reports
            why, instead of showing 0 matches and letting that read as failure.
            Read from the summary so it is present on load — it used to render
            only from a run result, which meant the chain appeared once and
            vanished on refresh, hiding work that had actually been done. A
            fresh run's legs take over when one has just happened. */}
        {(runResult?.legs ?? summary?.legs) ? (
          <LegBreakdown legs={runResult?.legs ?? summary.legs} live={!runResult} freight={summary?.freight} />
        ) : null}

        {items === null ? (
          <TableSkeleton rows={8} />
        ) : (
          <>
            {loadFailed ? (
              <p className="text-[13px]" style={{ color: "var(--color-destructive)" }}>
                Couldn&apos;t load orders. Try again.
              </p>
            ) : null}
            <ReconciliationTable
              rows={items}
              filters={filters}
              onFilterChange={setFilters}
              dateControl={<DateRangePicker />}
              channels={channels}
              statementCoverage={summary?.statementCoverage ?? null}
              onEvidence={openEvidence}
              onWriteOff={handleWriteOff}
              onRestore={handleRestore}
              onPair={(r) => setPairRow(r)}
              onUnpair={handleUnpair}
              writingOffId={writingOffId}
              restoringId={restoringId}
              unpairingId={unpairingId}
            />
            <div ref={sentinelRef} />
            {loadingMore ? (
              <p className="py-3 text-center text-[12.5px] text-muted-foreground">Loading more…</p>
            ) : null}
            {!nextCursor && items.length > 0 ? (
              <p className="py-3 text-center text-[12.5px] text-muted-foreground">
                End of results — {items.length.toLocaleString("en-IN")} orders shown.
              </p>
            ) : null}
          </>
        )}
      </div>

      <EvidenceDrawer
        open={drawer.open}
        title={drawer.title}
        sourceLabel={drawer.sourceLabel}
        rows={drawer.rows}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
      />

      <PairDialog
        open={pairRow !== null}
        row={pairRow}
        onClose={() => setPairRow(null)}
        onPaired={handlePaired}
      />
    </>
  );
}

function LegBreakdown({ legs, live = false, freight = null }) {
  return (
    <div className="card">
      <div className="card-kicker">Reconciliation chain</div>
      {/* The engine matches the whole order book in one pass — it has to, since
          a payment can arrive in a period after the order was placed. So these
          counts are all-time and would otherwise be read as belonging to the
          period filter above, which they never are. */}
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        {live ? "Current state" : "From the run just completed"}, across all orders — not limited to the
        period selected above.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {legs.map((leg) => (
          <div key={leg.matchType} className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13.5px] font-medium text-foreground">{LEG_LABELS[leg.matchType] ?? leg.matchType}</span>
              {leg.state === "ran" ? (
                <span className="text-[12.5px] text-muted-foreground">
                  {leg.matched.toLocaleString("en-IN")} matched · {leg.needsReview.toLocaleString("en-IN")} to review ·{" "}
                  {leg.unmatched.toLocaleString("en-IN")} unmatched
                </span>
              ) : (
                <span className="text-[12.5px]" style={{ color: "var(--color-accent)" }}>Not available yet</span>
              )}
            </div>
            {/* The money, not just the counts — 542 of 8,388 matched reads as a
                detail until it says ₹6.9L of ₹2.1Cr is verified. The freight leg
                is excluded: its unmatched value is deliberately zero (what an
                unbilled parcel WILL cost is unknown until its invoice arrives),
                so rendering it would print a false ₹0. */}
            {leg.state === "ran" && leg.matchType !== "SHIPMENT_FREIGHT" ? (
              <p className="text-[12.5px] text-muted-foreground">
                <span className="text-foreground">{formatPaise(leg.matchedValue)}</span> verified ·{" "}
                {formatPaise(leg.unmatchedValue)} not yet traced
              </p>
            ) : null}
            {leg.blockedReason ? (
              <p className="text-[12.5px] text-muted-foreground">{leg.blockedReason}</p>
            ) : null}
            {/* The freight leg counts shipments, which cannot express the half
                that matters most: lines the courier billed for waybills we have
                no shipment for. That is money leaving for something this system
                cannot verify, and there is nowhere else it would surface. */}
            {leg.matchType === "SHIPMENT_FREIGHT" && leg.state === "ran" && freight ? (
              <div className="text-[12.5px] text-muted-foreground flex flex-col gap-0.5">
                <div>
                  {freight.invoices} invoice{freight.invoices === 1 ? "" : "s"} imported ·{" "}
                  {freight.lines.toLocaleString("en-IN")} billed lines ·{" "}
                  <span className="text-foreground">{formatPaise(freight.billedPaise)}</span> charged
                </div>
                {freight.linesWithoutShipment > 0 ? (
                  <div style={{ color: "var(--color-accent)" }}>
                    {freight.linesWithoutShipment.toLocaleString("en-IN")} billed lines match no shipment we hold —{" "}
                    {formatPaise(freight.valueWithoutShipmentPaise)} charged for parcels this system cannot
                    verify.
                  </div>
                ) : null}
                {freight.returnLegCount > 0 ? (
                  <div>
                    {freight.returnLegCount.toLocaleString("en-IN")} return-leg charges (RTO),{" "}
                    {formatPaise(freight.returnLegPaise)} — parcels billed twice.
                  </div>
                ) : null}
                {/* Credit lines are stored negative; shown as the positive
                    amount the courier gave back, which is how the founder
                    reads their invoice. */}
                {freight.creditCount > 0 ? (
                  <div>
                    {freight.creditCount.toLocaleString("en-IN")} credit note line
                    {freight.creditCount === 1 ? "" : "s"},{" "}
                    {formatPaise(String(freight.creditPaise).replace("-", ""))} credited back by the courier.
                  </div>
                ) : null}
                {/* The invoice window bounds every freight number above it: a
                    shipment outside these dates isn't unmatched, it's simply
                    from a month whose invoice hasn't been uploaded. */}
                {freight.earliestShipDate && freight.latestShipDate ? (
                  <div>
                    Invoices cover shipments from{" "}
                    {new Date(freight.earliestShipDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })} to{" "}
                    {new Date(freight.latestShipDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })} — shipments outside this window have no invoice on file yet.
                  </div>
                ) : null}
                {/* Coverage per carrier. Without it, "8,000 unmatched" reads as
                    a failure when it is simply the months not yet uploaded. */}
                {(freight.carriers ?? []).map((c) => (
                  <div key={c.carrier}>
                    {c.billedShipments.toLocaleString("en-IN")} of {c.shipments.toLocaleString("en-IN")}{" "}
                    {c.carrier} shipments have a freight cost.
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
