// §17 anomalies, as computed by cfo-backend's modules/calc/anomalies.ts and
// served by GET /anomalies.
//
// The rules used to live in the browser (lib/insights.js's deriveAnomalies,
// which still exists for the checks the server has no rule for — see the
// split documented there). Moving the financial ones server-side is what
// makes them auditable, assignable and persistent: a client-side alert
// vanishes on refresh and can never be acknowledged, owned, or asked "how
// long has this been true".
//
// This module only PRESENTS what the server decided. It performs no
// arithmetic on money and applies no thresholds of its own — every number
// below is already final when it arrives.

import { formatInrShort } from "@/lib/money";

// Server AnomalySeverity → the tone vocabulary AlertCard already speaks.
const SEVERITY = { CRITICAL: "critical", WARNING: "warning", INFO: "info" };

// Where a founder goes to act on each kind of finding. A card whose
// "Investigate" button lands on a page that cannot show the underlying rows
// is worse than one with no button at all.
const HREF = {
  REVENUE_DECLINE: "/revenue",
  REVENUE_SPIKE: "/revenue",
  AD_SPEND_SPIKE: "/expenses",
  RTO_INCREASE: "/reconciliation",
  REFUND_INCREASE: "/revenue",
  COURIER_COST_INCREASE: "/reconciliation",
  NEGATIVE_MARGIN_SKU: "/profitability",
  MISSING_SETTLEMENT: "/reconciliation",
  DUPLICATE_PAYMENT: "/reconciliation",
  CANCELLATION_INCREASE: "/revenue",
  PRODUCT_COST_INCREASE: "/costs",
  CASH_BELOW_THRESHOLD: "/cash-flow",
};

// One headline per type. Written from the anomaly's own observed/expected
// figures rather than re-deriving anything — `a.evidence` carries the
// rule-specific extras (changePct, SKU lists, paise strings).
function titleFor(a) {
  const e = a.evidence ?? {};
  switch (a.type) {
    case "REVENUE_DECLINE":
      return `Net revenue down ${Math.abs(e.changePct ?? 0)}%`;
    case "REVENUE_SPIKE":
      return `Net revenue up ${e.changePct ?? 0}%`;
    case "AD_SPEND_SPIKE":
      return `Ad spend up ${e.changePct ?? 0}%`;
    case "RTO_INCREASE":
      return `RTO rate up ${a.difference} points to ${a.observedValue}%`;
    case "REFUND_INCREASE":
      return `Refund rate ${a.observedValue}% of revenue`;
    case "COURIER_COST_INCREASE":
      return `Courier cost up ${e.changePct ?? 0}%`;
    case "NEGATIVE_MARGIN_SKU":
      return `${a.observedValue} product${a.observedValue === 1 ? "" : "s"} selling below cost`;
    case "MISSING_SETTLEMENT":
      return `${e.label ?? "A payout account"} has not settled in ${a.observedValue} days`;
    case "DUPLICATE_PAYMENT":
      return `${a.observedValue} order${a.observedValue === 1 ? "" : "s"} charged twice`;
    case "CANCELLATION_INCREASE":
      return `Cancellation rate ${a.observedValue}%`;
    case "PRODUCT_COST_INCREASE":
      return `Landed cost rose on ${a.observedValue} SKU${a.observedValue === 1 ? "" : "s"}`;
    case "CASH_BELOW_THRESHOLD":
      return `Available cash below your ${formatInrShort(a.expectedValue)} threshold`;
    default:
      // A type this build doesn't know about is still shown, not swallowed —
      // a backend that ships a new rule before the frontend knows its
      // wording should degrade to something readable, not to silence.
      return a.type.toLowerCase().replaceAll("_", " ");
  }
}

// The one-line body under the headline. Money-shaped rules restate the two
// figures; rate-shaped rules restate the movement; count-shaped rules name
// what was counted.
function descriptionFor(a) {
  const e = a.evidence ?? {};
  switch (a.type) {
    case "REVENUE_DECLINE":
    case "REVENUE_SPIKE":
      return `${formatInrShort(a.observedValue)} over the last 28 days, against ${formatInrShort(a.expectedValue)} in the preceding 28.`;
    case "AD_SPEND_SPIKE":
      return `${formatInrShort(a.observedValue)} spent, against ${formatInrShort(a.expectedValue)} in the preceding 28 days.`;
    case "COURIER_COST_INCREASE":
      return `${formatInrShort(a.observedValue)} billed by couriers, against ${formatInrShort(a.expectedValue)} in the preceding 28 days.`;
    case "CASH_BELOW_THRESHOLD":
      return `${formatInrShort(a.observedValue)} available, ${formatInrShort(Math.abs(a.difference))} below the threshold you set.`;
    case "RTO_INCREASE":
      return `${e.rtoCount ?? "—"} of ${e.dispatchedCount ?? "—"} dispatched parcels came back, up from ${a.expectedValue}%.`;
    case "REFUND_INCREASE":
      return `${e.ordersWithRefund ?? "—"} orders refunded${e.priorRatePct != null ? `, against ${e.priorRatePct}% in the prior window` : ""}.`;
    case "CANCELLATION_INCREASE":
      return `${e.cancelledCount ?? "—"} orders cancelled${e.priorRatePct != null ? `, against ${e.priorRatePct}% in the prior window` : ""}.`;
    case "NEGATIVE_MARGIN_SKU":
      // cm0Pct is null when the SKU's net revenue is zero — everything sold
      // was refunded, so there is no revenue to express the margin against.
      // The loss is still real, so the SKU is still named; only the ratio is
      // dropped, rather than rendering "at null% CM0".
      if (!e.worst) return "Every sale of these loses money.";
      return e.worst.cm0Pct == null
        ? `Worst: ${e.worst.productName}, which has costs but no net revenue to set them against. Every sale of these loses money.`
        : `Worst: ${e.worst.productName} at ${e.worst.cm0Pct}% CM0. Every sale of these loses money.`;
    case "MISSING_SETTLEMENT":
      return `Typical gap is ${a.expectedValue} day${a.expectedValue === 1 ? "" : "s"}. Nothing has arrived for ${a.difference} days longer than expected.`;
    case "DUPLICATE_PAYMENT":
      return `${formatInrShort(Number(e.totalDuplicated ?? 0))} captured more than once on the same orders — likely a retry after a slow gateway response.`;
    case "PRODUCT_COST_INCREASE":
      return e.worst
        ? `Steepest: ${e.worst.sku}, up ${e.worst.changePct}%. Margin on those SKUs is now lower than the dashboard assumed before the change.`
        : "Margin on those SKUs is now lower than previously assumed.";
    default:
      return a.recommendedInvestigation ?? "";
  }
}

/**
 * A server anomaly in the shape AlertCard already renders.
 *
 * `recommendedInvestigation` becomes the meta line rather than being dropped:
 * it is the part of the record that tells a human what to actually go and do,
 * and §17 lists it as a first-class field of an anomaly.
 */
export function toAlert(a) {
  return {
    id: a.id,
    severity: SEVERITY[a.severity] ?? "info",
    title: titleFor(a),
    description: descriptionFor(a),
    meta: a.recommendedInvestigation,
    href: HREF[a.type] ?? null,
    // Carried through so a caller can render triage controls without a
    // second fetch. Nothing on this page mutates them yet.
    status: a.status,
    ownerId: a.ownerId,
    type: a.type,
    source: "server",
  };
}

export function toAlerts(payload) {
  if (!payload?.anomalies) return [];
  return payload.anomalies.map(toAlert);
}
