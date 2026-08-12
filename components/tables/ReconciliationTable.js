"use client";

import StatusBadge from "@/components/ui/StatusBadge";
import Explain from "@/components/ui/Explain";

// Fully controlled and stateless. Every filter is a query param the page turns
// into a backend request — none of it is applied here.
//
// This table used to hold its own search/status/channel state and filter an
// array in the browser. That works for the eight hardcoded rows it shipped
// with; against 49,617 real orders it means downloading the entire order book
// to show a hundred rows of it. Filtering, paging and counting all belong on
// the server, and the component's job is to render what came back.

const STATUS_DISPLAY = {
  matched: { tone: "positive", label: "Matched" },
  review: { tone: "warning", label: "Needs review" },
  unmatched: { tone: "negative", label: "No payment found" },
  cod_pending: { tone: "neutral", label: "COD — awaiting remittance" },
  // Deliberately NOT the red "No payment found" it used to render as. An order
  // raised on payment terms never had a checkout payment to lose — it is an
  // unpaid bill, which is a normal state, not a failure.
  invoiced: { tone: "warning", label: "Invoice — awaiting payment" },
  written_off: { tone: "neutral", label: "Written off" },
  cancelled: { tone: "neutral", label: "Cancelled" },
};

export const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "unmatched", label: "No payment found" },
  { value: "invoiced", label: "Invoice — awaiting payment" },
  { value: "review", label: "Needs review" },
  { value: "matched", label: "Matched" },
  { value: "cod_pending", label: "COD — awaiting remittance" },
  { value: "written_off", label: "Written off" },
  { value: "cancelled", label: "Cancelled" },
];

const PAYMENT_MODE_OPTIONS = [
  { value: "all", label: "All payment modes" },
  { value: "PREPAID", label: "Prepaid" },
  { value: "COD", label: "Cash on delivery" },
  { value: "UNKNOWN", label: "Unknown" },
];

// Paise → rupees, as integers all the way. The backend sends money as a
// string precisely so it never passes through a float; parsing it into one
// here would give that back.
function formatPaise(paise) {
  if (paise === null || paise === undefined) return "—";
  const negative = paise.startsWith("-");
  const digits = (negative ? paise.slice(1) : paise).padStart(3, "0");
  const rupees = digits.slice(0, -2);
  const decimals = digits.slice(-2);
  const grouped = Number(rupees).toLocaleString("en-IN");
  return `${negative ? "−" : ""}₹${grouped}.${decimals}`;
}

// Three distinct states, kept distinct on purpose. A blank cell would collapse
// "the gateway paid us ₹20.69 on 1 Aug" and "no statement has ever been
// imported" into the same nothing, and only one of those is a gap the reader
// can close.
function SettledCell({ settlement, statementCoverage, placedAt }) {
  if (settlement) {
    return (
      <div className="text-[12.5px] leading-relaxed">
        <span className="font-medium" style={{ color: "var(--color-success)" }}>
          {formatPaise(settlement.netAmount)}
        </span>
        <div className="text-[11.5px] text-muted-foreground">
          {settlement.settledAt
            ? new Date(settlement.settledAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
            : "date not stated"}
          {settlement.feeAmount && settlement.feeAmount !== "0" ? ` · fee ${formatPaise(settlement.feeAmount)}` : ""}
        </div>
        {settlement.utr ? (
          <div className="font-mono text-[11px] text-muted-foreground" title="Look this up on your bank statement">
            {settlement.utr}
          </div>
        ) : null}
      </div>
    );
  }

  // An order placed outside every imported statement's window is not an
  // anomaly — no statement could contain it. Saying so prevents a reader
  // reading 24,000 blanks as 24,000 missing payments.
  const outsideCoverage =
    statementCoverage?.latest && placedAt && new Date(placedAt) > new Date(statementCoverage.latest);
  if (!statementCoverage?.latest) {
    return <span className="text-[12px] text-muted-foreground">No statement imported</span>;
  }
  if (outsideCoverage) {
    return <span className="text-[12px] text-muted-foreground">Awaiting payout</span>;
  }
  return (
    <span className="text-[12px]" style={{ color: "var(--color-accent)" }} title="A statement covers this date, but this order is not in it">
      Not in statement
    </span>
  );
}

export default function ReconciliationTable({
  rows = [],
  filters,
  onFilterChange,
  // The window the imported provider statements actually cover. Without it the
  // Settled column cannot tell "not paid" from "not yet reported on".
  statementCoverage = null,
  // The period control, passed in as an element rather than built here: the
  // period is shared application state (the same control lives in the global
  // header), while every other filter on this row is a prop this component
  // reads. Rendering it here would give the page two sources for one window.
  dateControl = null,
  channels = [],
  loading = false,
  onEvidence,
  onWriteOff,
  onRestore,
  writingOffId = null,
  restoringId = null,
}) {
  const set = (key) => (e) => onFilterChange({ ...filters, [key]: e.target.value });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        {dateControl}
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Search order number…"
          value={filters.searchInput}
          onChange={(e) => onFilterChange({ ...filters, searchInput: e.target.value })}
        />
        <select className="input" style={{ width: "auto" }} value={filters.status} onChange={set("status")}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select className="input" style={{ width: "auto" }} value={filters.paymentMode} onChange={set("paymentMode")}>
          {PAYMENT_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {channels.length > 1 ? (
          <select className="input" style={{ width: "auto" }} value={filters.channel} onChange={set("channel")}>
            <option value="all">All channels</option>
            {channels.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        ) : null}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Channel</th>
              <th>Mode</th>
              <th>Placed</th>
              <th><Explain term="col-expected">Expected</Explain></th>
              <th><Explain term="col-received">Received</Explain></th>
              <th>Difference</th>
              <th>How it was matched</th>
              <th>Status</th>
              <th><Explain term="col-settled">Settled</Explain></th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const display = STATUS_DISPLAY[r.status] ?? STATUS_DISPLAY.unmatched;
              const hasDifference = r.difference !== null && r.difference !== "0";
              return (
                <tr key={r.id}>
                  <td className="font-medium text-foreground">{r.orderNumber}</td>
                  <td>{r.channel}</td>
                  <td className="text-[12.5px] text-muted-foreground">{r.paymentMode ?? "—"}</td>
                  <td className="text-[12.5px] text-muted-foreground">
                    {new Date(r.placedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                  </td>
                  <td>{formatPaise(r.expected)}</td>
                  <td>{formatPaise(r.received)}</td>
                  <td
                    className="font-medium"
                    style={{ color: hasDifference ? "var(--color-destructive)" : "var(--color-success)" }}
                  >
                    {r.difference === null ? "—" : formatPaise(r.difference)}
                  </td>
                  <td className="text-[12.5px] text-muted-foreground">
                    {r.matchMethod}
                    {/* The context that stops a staff-raised invoice reading as
                        a lost payment: who it was billed to and when it falls
                        due. The full trail (who raised it, the confirmation
                        number, what was emailed) is in Evidence. */}
                    {r.invoice ? (
                      <div className="mt-1 text-[12px] leading-relaxed">
                        <span className="text-foreground">
                          {r.invoice.customerName || r.invoice.customerEmail || "Customer"}
                        </span>
                        {r.invoice.customerName && r.invoice.customerEmail ? ` · ${r.invoice.customerEmail}` : ""}
                        <br />
                        {r.invoice.dueDescription}
                      </div>
                    ) : null}
                  </td>
                  {/* The status is the output of a seven-branch classifier, not
                      a field on the order — so it explains which branch it fell
                      through and why. */}
                  <td><StatusBadge status={display.tone} label={display.label} term={`status-${r.status.replaceAll("_", "-")}`} /></td>
                  {/* The independent half of the story. Status says our two
                      Shopify records agree; this says a third party actually
                      transferred money, and names the transfer. */}
                  <td><SettledCell settlement={r.settlement} statementCoverage={statementCoverage} placedAt={r.placedAt} /></td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <button
                        className="cursor-pointer border-none bg-transparent p-0 text-[12.5px] text-primary"
                        onClick={() => onEvidence?.(r)}
                        type="button"
                      >
                        Evidence
                      </button>
                      {/* Only offered where it means something. Writing off a
                          matched order, or one that is merely waiting on a
                          courier, would record a decision nobody made. */}
                      {r.status === "unmatched" ? (
                        <button
                          className="cursor-pointer border-none bg-transparent p-0 text-[12.5px] text-muted-foreground"
                          onClick={() => onWriteOff?.(r)}
                          type="button"
                          disabled={writingOffId === r.id}
                        >
                          {writingOffId === r.id ? "Saving…" : "Write off"}
                        </button>
                      ) : null}
                      {/* A decision must be reversible. Undo deletes the
                          write-off and re-derives the row from the evidence —
                          it does NOT guess what the status "was before". */}
                      {r.status === "written_off" ? (
                        <button
                          className="cursor-pointer border-none bg-transparent p-0 text-[12.5px] text-muted-foreground"
                          onClick={() => onRestore?.(r)}
                          type="button"
                          disabled={restoringId === r.id}
                        >
                          {restoringId === r.id ? "Restoring…" : "Undo write-off"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && rows.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted-foreground">No orders match these filters.</p>
      ) : null}
    </div>
  );
}

export { formatPaise };
