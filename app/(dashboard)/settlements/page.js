"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import Metric from "@/components/ui/Metric";
import DataStatusBadge from "@/components/ui/DataStatusBadge";
import MetricSkeleton from "@/components/ui/MetricSkeleton";
import NoDataPanel from "@/components/ui/NoDataPanel";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatPaise } from "@/components/tables/ReconciliationTable";
import { useDateRange } from "@/components/controls/DateRangeContext";
import { loadProgressively } from "@/components/lib/progressiveLoad";

// "Settlements" means money a third party is holding on your behalf, or has
// released to you. There are two sources and this store has both:
//   Gateway payouts    — GoKwik settlement statements, imported as CSV.
//   COD in the courier network — measured from shipment status.
//
// This page used to hardcode "No settlement records exist for this
// organisation" across three panels. That was true when it was written and
// became false the moment a statement was imported — 37 payouts and 555 lines
// sat in the database while the page insisted there were none, because no
// settlements endpoint existed for it to ask.

const LINE_TYPE_LABEL = {
  PAYMENT: "Prepaid captures",
  SHIPMENT_COD: "COD remittance",
  ADJUSTMENT: "Adjustments & refunds",
};

// The two sources this page asks for. They answer at very different speeds —
// the reconciliation summary aggregates shipment status across the whole org,
// the settlement list reads an imported statement — and nothing about the COD
// position depends on the payout list or vice versa, so neither should wait
// for the other.
const REQUEST_KEYS = ["summary", "payouts"];

export default function SettlementsPage() {
  const { getToken } = useAuth();
  const { range, key: dateKey, preset: datePreset, ready: dateReady } = useDateRange();

  const [summary, setSummary] = useState(null);
  const [payouts, setPayouts] = useState(null);
  const [failed, setFailed] = useState(false);

  // Which sources are still in flight, per key rather than one page-level
  // boolean. A card gated on "is anything still loading" moves at the speed of
  // the slowest request; a card rendered against a payload that has not landed
  // yet would announce "No data" or "Connect a courier" about a source that is
  // merely slow. Only per-key pendency tells the truth on both counts.
  const [pending, setPending] = useState(() => new Set(REQUEST_KEYS));

  // WHICH source failed, not just that one did. A failed key is settled out of
  // `pending` deliberately (progressiveLoad.js:58) so the card stops spinning —
  // but with nothing else recorded it then falls through to its empty arm and
  // asserts "No gateway statement imported yet" about a request that never
  // answered. One that failed says it could not ask, one that simply has no
  // source says so instead; a founder chases a backend for the first and
  // connects a provider for the second.
  const [failedKeys, setFailedKeys] = useState(() => new Set());

  // Which payout is expanded, and the lines fetched for it. Lines are loaded on
  // demand rather than with the list: 37 payouts carrying 555 lines is fine,
  // 3,000 payouts carrying 90,000 would not be, and the shape should not have
  // to change when that day arrives.
  const [openId, setOpenId] = useState(null);
  const [lines, setLines] = useState({});
  const [linesLoading, setLinesLoading] = useState(null);

  useEffect(() => {
    if (!dateReady) return;
    let cancelled = false;
    // `cancelled` alone only stops a superseded answer being APPLIED — both
    // requests still run to completion server-side, and /reconciliation/summary
    // is the expensive one, aggregating shipment status across the whole org.
    // Dragging the date picker across four presets left four of those
    // aggregations competing with the one the reader is actually waiting on.
    const controller = new AbortController();
    async function load() {
      // Back to skeletons for the new window. Leaving the keys settled would
      // leave last period's figures on screen wearing the new period's heading.
      setPending(new Set(REQUEST_KEYS));
      setFailedKeys(new Set());
      setFailed(false);
      // And the payloads themselves discarded. Pendency alone is not enough: a
      // key that FAILS in the new load is deleted from `pending` without
      // `apply` ever running, and every read below (hasPayouts, inPeriod,
      // byLineType, the PayoutTable's own coverage dates) would then paint the
      // PREVIOUS window's figures under the new window's heading. Costs nothing
      // on the success path — each read is already behind a pending gate, so no
      // card can observe the null.
      setSummary(null);
      setPayouts(null);
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };
        const query = range ? `?from=${range.from}&to=${range.to}` : "";
        const api = process.env.NEXT_PUBLIC_API_URL;
        const { ok } = await loadProgressively(
          [
            { key: "summary", url: `${api}/reconciliation/summary${query}`, apply: setSummary },
            { key: "payouts", url: `${api}/settlements${query}`, apply: setPayouts },
          ],
          {
            init: { headers, signal: controller.signal },
            isCancelled: () => cancelled,
            onSettled: (key, ok) => {
              if (!ok) setFailedKeys((prev) => new Set(prev).add(key));
              // A new Set, or React sees the same reference and skips the
              // re-render that clears this card's skeleton.
              setPending((cur) => {
                const next = new Set(cur);
                next.delete(key);
                return next;
              });
            },
          }
        );
        // EVERY source failed, not just one. Raising the banner per key put
        // "Nothing below is live" directly above ₹72.2L of live courier-held
        // COD whenever /settlements alone 500d — the reader was told to
        // disbelieve figures that were perfectly good. One source failing is
        // that card's business, and its own failure arm states it.
        if (!cancelled && ok === 0) setFailed(true);
      } catch {
        // getToken threw, so nothing was ever asked for and no key can settle
        // itself out of its skeleton — clear them all alongside the banner, and
        // mark both sources failed so the cards say "couldn't load" rather than
        // falling through to empty states nobody actually verified.
        if (!cancelled) {
          setFailed(true);
          setFailedKeys(new Set(REQUEST_KEYS));
          setPending(new Set());
        }
      }
    }
    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken, dateKey, dateReady]);

  const toggle = useCallback(
    async (id) => {
      if (openId === id) {
        setOpenId(null);
        return;
      }
      setOpenId(id);
      if (lines[id]) return;
      setLinesLoading(id);
      try {
        const token = await getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settlements/${id}/lines`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const body = await res.json();
          setLines((cur) => ({ ...cur, [id]: body }));
        }
      } finally {
        setLinesLoading(null);
      }
    },
    [getToken, lines, openId]
  );

  // The all-time position, NOT the period block. What a courier is holding is
  // a position ("where is the money right now"), and scoping it to the date
  // picker made the default month-to-date view report ₹0 of unknown COD while
  // ₹72.2L of parcels sat silent — none of those orders were placed this month.
  const cod = summary?.codPosition ?? summary?.cod;
  const hasCourierData = cod?.hasCourierData === true;
  const totals = payouts?.totals;
  const hasPayouts = (totals?.allTime?.count ?? 0) > 0;
  const inPeriod = totals?.inPeriod;

  // Gross and fee live on the lines, so an effective rate can only be stated
  // when lines exist. Never derived from the payout net alone — that would give
  // a denominator the provider never reported.
  const grossInPeriod = (totals?.byLineType ?? []).reduce((sum, t) => sum + BigInt(t.grossAmount), 0n);
  const feeInPeriod = (totals?.byLineType ?? []).reduce((sum, t) => sum + BigInt(t.feeAmount), 0n);
  const feeRate =
    grossInPeriod > 0n ? Number((feeInPeriod * 10000n) / grossInPeriod) / 100 : null;

  return (
    <>
      <TopNav
        title="Settlements"
        subtitle={`Money other people are holding for you · ${datePreset.toLowerCase()}`}
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

        {/* ---- Gateway payouts: what a provider says it actually sent ---- */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Gated on "payouts", not on both keys: every figure in these two
              cards comes from the settlement list. The honesty badge reads the
              summary, and DataStatusBadge renders nothing until it has a
              status — an absent pill claims nothing, so it can arrive late
              without the card having said anything untrue in the meantime. */}
          {pending.has("payouts") ? (
            <MetricSkeleton />
          ) : failedKeys.has("payouts") ? (
            <MetricUnavailable label="Paid out to you" source="settlement list" />
          ) : (
            <Metric
              label="Paid out to you"
              badge={<DataStatusBadge dataStatus={summary?.settlementDataStatus} />}
              value={hasPayouts ? formatPaise(inPeriod.netAmount) : "No data"}
              change={
                hasPayouts
                  ? `${inPeriod.count.toLocaleString("en-IN")} payout${inPeriod.count === 1 ? "" : "s"}`
                  : "Import a statement"
              }
              tone={hasPayouts ? "positive" : "neutral"}
              // The all-time figure sits alongside the window's, so a narrow
              // picker (the default month) can't hide 26 of 37 payouts.
              sub={
                hasPayouts
                  ? `Net of provider fees, this period · all-time ${totals.allTime.count.toLocaleString("en-IN")} payouts, ${formatPaise(totals.allTime.netAmount)}`
                  : "No gateway statement imported yet"
              }
            />
          )}
          {pending.has("payouts") ? (
            <MetricSkeleton />
          ) : failedKeys.has("payouts") ? (
            <MetricUnavailable label="Provider fees" source="settlement list" />
          ) : (
            <Metric
              label="Provider fees"
              badge={<DataStatusBadge dataStatus={summary?.settlementDataStatus} />}
              value={grossInPeriod > 0n ? formatPaise(feeInPeriod.toString()) : "No data"}
              change={feeRate !== null ? `${feeRate.toFixed(2)}% of gross` : "—"}
              tone={feeRate !== null && feeRate > 3 ? "negative" : "neutral"}
              sub={grossInPeriod > 0n ? `On ${formatPaise(grossInPeriod.toString())} settled` : ""}
            />
          )}
          {pending.has("summary") ? (
            <MetricSkeleton />
          ) : failedKeys.has("summary") ? (
            <MetricUnavailable label="COD collected, not yet remitted" source="reconciliation summary" />
          ) : (
            <Metric
              label="COD collected, not yet remitted"
              badge={<DataStatusBadge dataStatus={summary?.codDataStatus} />}
              value={hasCourierData ? formatPaise(cod.deliveredValue) : "No data"}
              change={hasCourierData ? `${cod.deliveredCount.toLocaleString("en-IN")} delivered` : "Connect a courier"}
              tone={hasCourierData ? "warning" : "neutral"}
              sub={hasCourierData ? "Couriers are holding this cash" : "Needs Shiprocket, Delhivery or ClickPost"}
            />
          )}
          {/* The bucket this page used to hide inside "in transit". A parcel
              picked up 287 days ago is not on its way — the courier stopped
              reporting, and that is a different and much worse fact. */}
          {pending.has("summary") ? (
            <MetricSkeleton />
          ) : failedKeys.has("summary") ? (
            <MetricUnavailable label="Status unknown" source="reconciliation summary" />
          ) : (
            <Metric
              label="Status unknown"
              badge={<DataStatusBadge dataStatus={summary?.codDataStatus} />}
              value={hasCourierData ? formatPaise(cod.unknownValue) : "No data"}
              change={
                hasCourierData && cod.unknownCount > 0
                  ? `${cod.unknownCount.toLocaleString("en-IN")} parcels · oldest ${cod.unknownOldestDays}d`
                  : "—"
              }
              tone={hasCourierData && Number(cod.unknownValue) > 0 ? "negative" : "neutral"}
              sub={
                hasCourierData && cod.unknownCount > 0
                  ? "Picked up over 30 days ago and never scanned again — neither collectible nor written off"
                  : ""
              }
            />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {pending.has("summary") ? (
            <MetricSkeleton />
          ) : failedKeys.has("summary") ? (
            <MetricUnavailable label="COD still in transit" source="reconciliation summary" />
          ) : (
            <Metric
              label="COD still in transit"
              badge={<DataStatusBadge dataStatus={summary?.codDataStatus} />}
              value={hasCourierData ? formatPaise(cod.inFlightValue) : "No data"}
              change={hasCourierData ? `${cod.inFlightCount.toLocaleString("en-IN")} orders` : "Connect a courier"}
              tone="neutral"
              sub={hasCourierData ? "Recently picked up — genuinely still moving" : "Delivery status unknown"}
            />
          )}
          {pending.has("summary") ? (
            <MetricSkeleton />
          ) : failedKeys.has("summary") ? (
            <MetricUnavailable label="RTO — never collected" source="reconciliation summary" />
          ) : (
            <Metric
              label="RTO — never collected"
              value={hasCourierData ? formatPaise(cod.rtoValue) : "No data"}
              change={hasCourierData ? `${cod.rtoCount.toLocaleString("en-IN")} returned` : "Connect a courier"}
              tone={hasCourierData && Number(cod.rtoValue) > 0 ? "negative" : "neutral"}
              sub={hasCourierData ? "Came back undelivered — this cash will never arrive" : ""}
            />
          )}
          {pending.has("summary") ? (
            <MetricSkeleton />
          ) : failedKeys.has("summary") ? (
            <MetricUnavailable label="Prepaid deposits already banked" source="reconciliation summary" />
          ) : (
            <Metric
              label="Prepaid deposits already banked"
              value={hasCourierData ? formatPaise(cod.onlineDepositsValue) : "No data"}
              change={hasCourierData ? "PPCOD" : "—"}
              tone="positive"
              sub={hasCourierData ? "Collected online at checkout, not riding with the courier" : ""}
            />
          )}
          {pending.has("payouts") ? (
            <MetricSkeleton />
          ) : failedKeys.has("payouts") ? (
            <MetricUnavailable label="Lines not matched to an order" source="settlement list" />
          ) : (
            <Metric
              label="Lines not matched to an order"
              value={totals ? totals.unresolvedLines.toLocaleString("en-IN") : "No data"}
              change={totals && totals.unresolvedLines > 0 ? "Needs attention" : "All resolved"}
              tone={totals && totals.unresolvedLines > 0 ? "warning" : "positive"}
              sub={
                totals && totals.unresolvedLines > 0
                  ? "The provider settled something this system has never ingested"
                  : "Every settled line points at an order we hold"
              }
            />
          )}
        </div>

        {/* ---- The payouts themselves ---- */}
        {/* The failure arm comes before the empty one for the same reason the
            cards have one: "No settlement statement has been imported for this
            organisation" is a finding about the database, and a request that
            did not answer produced no finding at all. */}
        {pending.has("payouts") ? null : failedKeys.has("payouts") ? (
          <NoDataPanel
            title="Gateway and marketplace payouts"
            reason="The settlement list did not answer, so the payouts for this period could not be read. This says nothing about whether a statement has been imported — it is a connection problem, not a zero."
            tone="error"
          />
        ) : hasPayouts ? (
          <PayoutTable
            payouts={payouts.payouts}
            byLineType={totals.byLineType}
            coverage={payouts.coverage}
            periodBasis={payouts.periodBasis}
            openId={openId}
            lines={lines}
            linesLoading={linesLoading}
            onToggle={toggle}
          />
        ) : (
          <NoDataPanel
            title="Gateway and marketplace payouts"
            reason="No settlement statement has been imported for this organisation. A payout statement is what states which orders were in which bank transfer — without one, money arriving cannot be tied to the orders that produced it."
            action="Import a settlement statement"
            href="/connections"
          />
        )}

        {/* Ageing needs a courier remittance statement to age AGAINST. Gateway
            payouts are dated and settled; courier COD is not, and conflating
            them would age money that has already arrived. */}
        <NoDataPanel
          title="COD settlement ageing"
          reason="Ageing needs a courier remittance statement to measure against — we can see what couriers are holding, but not when each batch was due. Importing one remittance export turns this on."
          action="Go to Connections"
          href="/connections"
        />
      </div>
    </>
  );
}

// What a card shows when its OWN source failed. The empty states on this page
// are confident sentences — "Import a statement", "Connect a courier", "Every
// settled line points at an order we hold" — and every one of them is a claim
// about the merchant's data. None of them can be made about a request that
// never answered, so this arm sits between the skeleton and the empty state and
// says only what is actually known: we asked, and nothing came back.
function MetricUnavailable({ label, source }) {
  return (
    <Metric
      label={label}
      value="Couldn't load"
      change="Request failed"
      tone="neutral"
      sub={`The ${source} did not answer — this is not a statement about your data.`}
    />
  );
}

function PayoutTable({ payouts, byLineType, coverage, periodBasis, openId, lines, linesLoading, onToggle }) {
  return (
    <div className="card">
      <div className="card-kicker">Payouts</div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        {/* Named explicitly: this is the ONE page whose period means payout date
            rather than order date, and a reader comparing this to Revenue
            deserves to know why the two windows disagree. */}
        Filtered by {periodBasis}, not order date.
        {coverage?.earliest && coverage?.latest ? (
          <>
            {" "}Imported statements cover{" "}
            <span className="text-foreground">
              {new Date(coverage.earliest).toLocaleDateString("en-IN")} to{" "}
              {new Date(coverage.latest).toLocaleDateString("en-IN")}
            </span>
            .
          </>
        ) : null}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {byLineType.map((t) => (
          <span
            key={t.type}
            className="rounded-full bg-muted px-2.5 py-1 text-[12px] text-muted-foreground"
            title={`Gross ${formatPaise(t.grossAmount)} · fees ${formatPaise(t.feeAmount)}`}
          >
            {LINE_TYPE_LABEL[t.type] ?? t.type}: {t.count.toLocaleString("en-IN")} ·{" "}
            <span className="text-foreground">{formatPaise(t.netAmount)}</span>
          </span>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Payout date</th>
              <th>Bank reference (UTR)</th>
              <th>Provider</th>
              <th>Lines</th>
              <th>Fees</th>
              <th>Net received</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <PayoutRow
                key={p.id}
                payout={p}
                open={openId === p.id}
                detail={lines[p.id]}
                loading={linesLoading === p.id}
                onToggle={onToggle}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PayoutRow({ payout, open, detail, loading, onToggle }) {
  return (
    <>
      <tr>
        <td className="font-medium text-foreground">
          {payout.settledAt
            ? new Date(payout.settledAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
            : "Not stated"}
        </td>
        <td className="font-mono text-[12px] text-muted-foreground">{payout.utr ?? "—"}</td>
        <td className="text-[12.5px] text-muted-foreground">{payout.provider}</td>
        <td>{payout.lineCount.toLocaleString("en-IN")}</td>
        <td className="text-[12.5px] text-muted-foreground">{formatPaise(payout.feeAmount)}</td>
        <td className="font-medium" style={{ color: "var(--color-success)" }}>
          {formatPaise(payout.netAmount)}
        </td>
        <td>
          <button
            type="button"
            className="cursor-pointer border-none bg-transparent p-0 text-[12.5px] text-primary"
            onClick={() => onToggle(payout.id)}
          >
            {open ? "Hide" : "What's in it"}
          </button>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={7} className="bg-muted/40 p-0">
            {loading ? (
              <p className="px-4 py-3 text-[12.5px] text-muted-foreground">Loading lines…</p>
            ) : detail ? (
              <PayoutLines detail={detail} />
            ) : (
              <p className="px-4 py-3 text-[12.5px] text-muted-foreground">Couldn&apos;t load the lines.</p>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function PayoutLines({ detail }) {
  return (
    <div className="px-4 py-3">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Provider reference</th>
              <th>Type</th>
              <th>Gross</th>
              <th>Fee</th>
              <th>Net</th>
              <th>Covers</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((l) => {
              // A ₹21 deposit against a ₹1,498 order is a correct line and a
              // partial payment. Stating the share stops "settled" being read as
              // "paid in full" — the single most misleading thing this table
              // could do.
              const share =
                l.orderTotal && l.orderTotal !== "0"
                  ? (Number(l.grossAmount) / Number(l.orderTotal)) * 100
                  : null;
              return (
                <tr key={l.id}>
                  <td className="font-medium text-foreground">{l.orderNumber ?? "—"}</td>
                  <td className="font-mono text-[11.5px] text-muted-foreground">{l.awb ?? l.reference}</td>
                  <td className="text-[12.5px] text-muted-foreground">{LINE_TYPE_LABEL[l.type] ?? l.type}</td>
                  <td>{formatPaise(l.grossAmount)}</td>
                  <td className="text-[12.5px] text-muted-foreground">{formatPaise(l.feeAmount)}</td>
                  <td className="font-medium">{formatPaise(l.netAmount)}</td>
                  <td>
                    {share === null ? (
                      <span className="text-[12px] text-muted-foreground">—</span>
                    ) : share >= 99.5 ? (
                      <StatusBadge status="positive" label="Whole order" />
                    ) : (
                      <StatusBadge status="warning" label={`${share.toFixed(1)}% of order`} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {detail.truncated ? (
        <p className="pt-2 text-[12px] text-muted-foreground">
          Showing the largest 500 lines of this payout.
        </p>
      ) : null}
    </div>
  );
}
