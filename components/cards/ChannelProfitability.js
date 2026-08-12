"use client";

import { formatInr } from "@/lib/money";

// §14 / §20.3 channel profitability (P6.7).
//
// The table stops at CM2 on purpose. Revenue, COGS, shipping and transaction
// fees all hang off an order, and an order knows which channel sold it — those
// allocate exactly. Advertising does not: a Meta campaign drives the store, the
// Amazon listing, and the brand search that converts on Flipkart three days
// later, and nothing in the data says which.
//
// Spreading ad spend by revenue share would fill the column and make every
// channel's margin move together, guaranteeing that none ever looks
// unprofitable on ads — which is the exact finding this table exists to
// surface. So the unattributed pool is shown as its own line with the amount
// stated, and the reader is told it has not been divided.

function Bar({ pct }) {
  // Clamped so a negative margin does not render as a bar pointing the wrong
  // way, and so a >100% value (possible when refunds exceed sales in a tiny
  // channel) does not overflow its container.
  const width = Math.max(0, Math.min(100, pct ?? 0));
  const negative = (pct ?? 0) < 0;
  return (
    <span className="mt-1 block h-1 w-full rounded-full bg-muted">
      <span
        className="block h-1 rounded-full"
        style={{
          width: `${negative ? 100 : width}%`,
          background: negative ? "var(--color-destructive)" : "var(--color-success)",
        }}
      />
    </span>
  );
}

export default function ChannelProfitability({ data, loading }) {
  if (loading) {
    return (
      <div className="gcard p-5" role="status" aria-busy="true">
        <span className="sr-only">Loading channel profitability</span>
        <div className="mb-4 h-4 w-1/3 animate-pulse rounded-sm bg-primary/10" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="mb-2 h-10 animate-pulse rounded-sm bg-primary/10" />
        ))}
      </div>
    );
  }

  if (!data || data.channels.length === 0) return null;

  return (
    <div className="gcard p-5">
      <h3 className="text-[15px] font-medium text-foreground">Profit by channel</h3>
      <p className="mb-3 text-[12px] text-muted-foreground">
        Contribution after product cost, shipping and transaction fees — everything that hangs off an order and
        therefore belongs to exactly one channel.
      </p>

      <div className="overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <th>Channel</th>
              <th className="text-right">Orders</th>
              <th className="text-right">Net revenue</th>
              <th className="text-right">COGS</th>
              <th className="text-right">Shipping</th>
              <th className="text-right">Fees</th>
              <th className="text-right">CM2</th>
            </tr>
          </thead>
          <tbody>
            {data.channels.map((c) => (
              <tr key={c.channel}>
                <td>
                  <span className="text-[13px] capitalize text-foreground">{c.channel}</span>
                  {/* Named per channel rather than as one page-level warning:
                      a founder reading Amazon's margin needs to know Amazon's
                      costs are incomplete, not that something somewhere is. */}
                  {!c.cogsComplete ? (
                    <span className="block text-[11px]" style={{ color: "var(--color-accent)" }}>
                      {c.uncostedLines.toLocaleString("en-IN")} lines uncosted — margin overstated
                    </span>
                  ) : null}
                </td>
                <td className="text-right text-[13px]">{c.orders.toLocaleString("en-IN")}</td>
                <td className="text-right text-[13px]">{formatInr(Number(c.netRevenueMinor))}</td>
                <td className="text-right text-[13px] text-muted-foreground">{formatInr(Number(c.cogsMinor))}</td>
                <td className="text-right text-[13px] text-muted-foreground">{formatInr(Number(c.shippingMinor))}</td>
                <td className="text-right text-[13px] text-muted-foreground">{formatInr(Number(c.transactionFeesMinor))}</td>
                <td className="text-right">
                  <span className="text-[13px] text-foreground">{formatInr(Number(c.cm2Minor))}</span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    {c.cm2Pct === null ? "—" : `${c.cm2Pct}%`}
                  </span>
                  <Bar pct={c.cm2Pct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The unallocated pool, always shown when non-zero. Hiding it would make
          the table look like a complete P&L split, which it deliberately is
          not. */}
      {Number(data.unallocatedAdSpendMinor) > 0 ? (
        <div
          className="mt-3 rounded-md border px-3 py-2.5"
          style={{ borderColor: "var(--color-accent)", background: "var(--color-accent-soft)" }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[13px]" style={{ color: "var(--color-accent)" }}>
              Ad spend not attributed to any channel
            </span>
            <span className="text-[13px]" style={{ color: "var(--color-accent)" }}>
              {formatInr(Number(data.unallocatedAdSpendMinor))}
            </span>
          </div>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--color-accent)" }}>
            Not divided across the channels above. Splitting it in proportion to revenue would make every channel&apos;s
            margin move together and guarantee none ever looks unprofitable on advertising — which is the one thing
            this table exists to reveal. Tag campaigns with a channel to allocate it.
          </p>
        </div>
      ) : null}
    </div>
  );
}
