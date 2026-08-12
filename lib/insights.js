// §98 anomaly detection and the actions that follow from it — rule-based, as
// the spec prescribes for the first pass, and derived entirely from payloads
// the pages have already fetched. That last part is the important constraint:
// an alert here is computed from the same figures the cards are showing, so an
// alert can never contradict the dashboard it sits on.
//
// Extracted from the Overview page so the Exceptions page can render the SAME
// alerts rather than a second, invented set. It previously listed five
// hardcoded ones ("Myntra settlement 19 days overdue, ₹5.2 L") naming a
// marketplace this store doesn't sell on, while the Overview computed real ones
// a scroll away.
//
// Thresholds are hardcoded for now; §98 says they should become
// organisation-configurable, which needs a settings table that doesn't exist.

// Re-exported from lib/money so the alert text and the cards it sits beside
// round identically. This file used to carry its own copy that abbreviated
// above ₹1 lakh instead of ₹10 lakh.
export { formatInrShort } from "@/lib/money";
import { formatInrShort } from "@/lib/money";
import { describeComparison } from "@/lib/period";

export function deriveAnomalies({ ladder, contribution, freshness, products, burn }) {
  const out = [];

  if (freshness) {
    const errored = freshness.sources.filter((s) => s.status === "ACTIVE" && s.lastSyncError);
    if (errored.length > 0) {
      out.push({
        severity: "critical",
        title: `${errored.length} data source${errored.length === 1 ? "" : "s"} failing to sync`,
        description: errored.map((s) => `${s.provider}: ${s.lastSyncError}`).join(" · ").slice(0, 200),
        meta: "Every number below is only as current as its source",
        href: "/connections",
      });
    }
    const never = freshness.sources.filter((s) => s.status === "ACTIVE" && s.lastSyncedAt === null);
    if (never.length > 0) {
      out.push({
        severity: "warning",
        title: `${never.length} connection${never.length === 1 ? " has" : "s have"} never synced`,
        description: `${never.map((s) => s.provider).join(", ")} — connected but no data has ever been pulled.`,
        meta: "Connections page → Sync now",
        href: "/connections",
      });
    }
  }

  // Missing COGS is the single biggest blocker on this dashboard, so it's an
  // anomaly rather than a quiet footnote.
  if (contribution && contribution.cogsCoverage.totalLines > 0 && contribution.cogsCoverage.valueCoveragePct < 95) {
    out.push({
      severity: "warning",
      title: `Product cost missing for ${100 - contribution.cogsCoverage.valueCoveragePct}% of order value`,
      description:
        "Contribution margin, product profitability and break-even cannot be computed until costs are entered. Until then this dashboard shows revenue, not profit.",
      meta: `${contribution.cogsCoverage.costedLines} of ${contribution.cogsCoverage.totalLines} order lines costed`,
      href: "/costs",
    });
  }

  if (ladder) {
    const revChange = ladder.ladder.netRevenue.changePct;
    if (revChange != null && revChange <= -20) {
      out.push({
        severity: "critical",
        title: `Net revenue down ${Math.abs(revChange)}%`,
        description: `${formatInrShort(ladder.ladder.netRevenue.value)} this period against ${formatInrShort(ladder.ladder.netRevenue.prior.value)} in the comparison window.`,
        // Names the actual dates. "vs same period last month" alone left a
        // reader unable to tell whether that meant the same day range, the
        // whole month, or a rolling 30 days.
        meta:
          describeComparison(ladder.window)?.sentence ??
          (ladder.comparison === "previous_month" ? "vs same period last month" : "vs previous period"),
        href: "/revenue",
      });
    }
    if (ladder.cancellations.ratePct != null && ladder.cancellations.ratePct >= 5) {
      out.push({
        severity: "warning",
        title: `Cancellation rate ${ladder.cancellations.ratePct}%`,
        description: `${ladder.cancellations.count} orders cancelled, worth ${formatInrShort(ladder.cancellations.value)} of order value that never became revenue.`,
        meta: "§67 · by order count",
        href: "/revenue",
      });
    }
    if (ladder.refunds.revenueRefundRatePct != null && ladder.refunds.revenueRefundRatePct >= 5) {
      out.push({
        severity: "warning",
        title: `Refund rate ${ladder.refunds.revenueRefundRatePct}% of revenue`,
        description: `${ladder.refunds.ordersWithRefund} orders refunded, ${formatInrShort(ladder.refunds.value)} returned to customers.`,
        meta: "§66 · by value",
        href: "/revenue",
      });
    }
    // COD share is a genuine risk signal in Indian D2C: it drives RTO exposure
    // and remittance lag, both of which hit cash rather than revenue.
    if (ladder.paymentMix.codPct != null && ladder.paymentMix.codPct >= 60) {
      out.push({
        severity: "info",
        title: `COD is ${ladder.paymentMix.codPct}% of orders`,
        description: `COD carries RTO risk and remittance delay that prepaid doesn't. COD is ${ladder.paymentMix.codValuePct ?? "—"}% of order value, so baskets differ by payment mode too.`,
        meta: "§68 · payment mix",
        href: "/reconciliation",
      });
    }
  }

  if (products?.canRankByMargin && products.bottomByMargin.length > 0) {
    const worst = products.bottomByMargin[0];
    out.push({
      severity: "critical",
      title: `${products.bottomByMargin.length} product${products.bottomByMargin.length === 1 ? "" : "s"} selling below cost`,
      description: `Worst: ${worst.productName} at ${worst.cm0Pct}% CM0 on ${formatInrShort(worst.netRevenue)} of revenue.`,
      meta: "§40 · negative contribution",
      href: "/profitability",
    });
  }

  if (burn?.burning && burn.runwayMonths != null && burn.runwayMonths < 6) {
    out.push({
      severity: "critical",
      title: `Runway ${burn.runwayMonths} months`,
      description: `Burning ${formatInrShort(burn.monthlyNetBurn)} a month against ${formatInrShort(burn.availableCash)} available.`,
      meta: "§85 · from bank transactions",
      href: "/cash-flow",
    });
  }

  return out;
}

// Actions a founder can actually take right now, derived from the same signals.
// Nothing speculative: each one points at a page that exists.
export function deriveActions({ contribution, freshness, products }) {
  const out = [];

  if (contribution && contribution.cogsCoverage.totalLines > 0 && contribution.cogsCoverage.valueCoveragePct < 95) {
    out.push({
      title: "Enter product costs",
      description: "Unblocks contribution margin, product profitability and loss-making-product detection. The cost page lists SKUs highest-revenue-first.",
      meta: "Product costs page",
      href: "/costs",
    });
  }
  if (contribution?.layers?.some((l) => !l.hasSource)) {
    const missing = contribution.layers.filter((l) => !l.hasSource).map((l) => l.label);
    out.push({
      title: "Connect the missing cost sources",
      description: `No data source for: ${missing.join(", ")}. Each one is a real cost currently counted as zero, so margin is overstated.`,
      meta: "Connections page",
      href: "/connections",
    });
  }
  if (freshness && freshness.staleSources > 0) {
    out.push({
      title: `Re-sync ${freshness.staleSources} stale source${freshness.staleSources === 1 ? "" : "s"}`,
      description:
        "No full sync in over 24 hours. Webhook-fed connectors may still be current — this tracks full syncs, which now run on a schedule, so a source stale for much longer than its interval is worth a look.",
      meta: "Connections page",
      href: "/connections",
    });
  }
  if (products && products.skuCount > 0 && products.costedSkuCount === 0) {
    out.push({
      title: "Review your top SKUs by revenue",
      description: `${products.skuCount} SKUs sold this period. Costing just the top few by revenue gets contribution margin most of the way there.`,
      meta: "Product costs page",
      href: "/costs",
    });
  }
  return out;
}
