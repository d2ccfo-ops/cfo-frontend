// The checks that STAY in the browser, now that §17's financial anomaly rules
// run server-side (cfo-backend modules/calc/anomalies.ts, surfaced by
// GET /anomalies and presented by lib/anomalies.js).
//
// Four rules moved out of this file and must NOT come back, or every screen
// double-reports them: revenue decline, cancellation rate, refund rate, and
// negative-margin SKUs. The server owns those now — it persists them, so they
// can be acknowledged, assigned an owner, and asked "how long has this been
// true", none of which a value recomputed on every render can support.
//
// What remains here is deliberately NOT financial-anomaly detection. It is
// SYSTEM HEALTH plus reconciliation position: "a connector is broken", "costs
// aren't entered", "COD has gone dark", "runway is short". Those have no
// server rule because they are not §17 anomaly types — they describe the
// state of the pipeline and the books rather than a metric that moved. They
// stay client-side because they are computed from payloads the pages have
// already fetched, so they cannot contradict the cards they sit beside.
//
// Thresholds here are still hardcoded; §98 says they should become
// organisation-configurable. The server-side rules now read the org cash
// threshold from OrgSettings — these are the ones still waiting.

// Re-exported from lib/money so the alert text and the cards it sits beside
// round identically. This file used to carry its own copy that abbreviated
// above ₹1 lakh instead of ₹10 lakh.
export { formatInrShort } from "@/lib/money";
import { formatInrShort } from "@/lib/money";

export function deriveSystemHealth({ ladder, contribution, freshness, burn, recon }) {
  const out = [];

  // Money-shaped exceptions from the reconciliation summary — the exceptions
  // page never looked at reconciliation at all, so the single largest number
  // in the system (COD parcels the courier stopped reporting on) had no home
  // on the one page whose job is "anomalies that need a human decision".
  if (recon) {
    const codPos = recon.codPosition ?? recon.cod;
    if (codPos?.hasCourierData && codPos.unknownCount > 0) {
      out.push({
      id: "health:cod-dark",
        severity: "critical",
        title: `${formatInrShort(Number(codPos.unknownValue.slice(0, -2) || "0"))} of COD has gone dark`,
        description: `${codPos.unknownCount.toLocaleString("en-IN")} parcels have reported no scan in 30+ days (oldest silent ${codPos.unknownOldestDays ?? "—"}d). Neither collectible nor written off — request a COD remittance MIS from the courier.`,
        meta: "All-time position, not period-scoped",
        href: "/reconciliation",
      });
    }
    const unmatched = recon.byStatus?.unmatched;
    if (unmatched && unmatched.count > 0) {
      out.push({
      id: "health:unmatched-payments",
        severity: "critical",
        title: `${unmatched.count.toLocaleString("en-IN")} checkout orders have no matching payment`,
        description: `${formatInrShort(Number(unmatched.value.slice(0, -2) || "0"))} of prepaid orders where the money never arrived or was never traced. Each one is either lost revenue or a matching gap — both need eyes.`,
        meta: "Reconciliation → No payment found",
        href: "/reconciliation",
      });
    }
    if (recon.freight && recon.freight.linesWithoutShipment > 0) {
      out.push({
      id: "health:freight-no-shipment",
        severity: "warning",
        title: `Courier billed ${formatInrShort(Number(recon.freight.valueWithoutShipmentPaise.slice(0, -2) || "0"))} for parcels we have no record of`,
        description: `${recon.freight.linesWithoutShipment.toLocaleString("en-IN")} invoice lines carry waybills matching no shipment — the classic overbilling flag. Real money leaving for something unverifiable.`,
        meta: "Freight invoices → unmatched lines",
        href: "/reconciliation",
      });
    }
  }

  if (freshness) {
    const errored = freshness.sources.filter((s) => s.status === "ACTIVE" && s.lastSyncError);
    if (errored.length > 0) {
      out.push({
      id: "health:sync-failing",
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
      id: "health:never-synced",
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
      id: "health:cogs-coverage",
      severity: "warning",
      title: `Product cost missing for ${100 - contribution.cogsCoverage.valueCoveragePct}% of order value`,
      description:
        "Contribution margin, product profitability and break-even cannot be computed until costs are entered. Until then this dashboard shows revenue, not profit.",
      meta: `${contribution.cogsCoverage.costedLines} of ${contribution.cogsCoverage.totalLines} order lines costed`,
      href: "/costs",
    });
  }

  if (ladder) {
    // Revenue decline, cancellation rate and refund rate used to be computed
    // here. They are §17 anomaly types and now come from GET /anomalies —
    // see this file's header. Re-adding them double-reports.
    //
    // COD share stays: it is a standing risk POSITION, not a metric that
    // moved, and there is no server rule for it. It is a genuine signal in
    // Indian D2C — it drives RTO exposure and remittance lag, both of which
    // hit cash rather than revenue.
    if (ladder.paymentMix.codPct != null && ladder.paymentMix.codPct >= 60) {
      out.push({
      id: "health:cod-share",
        severity: "info",
        title: `COD is ${ladder.paymentMix.codPct}% of orders`,
        description: `COD carries RTO risk and remittance delay that prepaid doesn't. COD is ${ladder.paymentMix.codValuePct ?? "—"}% of order value, so baskets differ by payment mode too.`,
        meta: "§68 · payment mix",
        href: "/reconciliation",
      });
    }
  }

  // Negative-margin SKUs were computed here too — now NEGATIVE_MARGIN_SKU
  // from the server, for the same reason as the three above.

  if (burn?.burning && burn.runwayMonths != null && burn.runwayMonths < 6) {
    out.push({
      id: "health:runway",
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
      id: "action:enter-costs",
      title: "Enter product costs",
      description: "Unblocks contribution margin, product profitability and loss-making-product detection. The cost page lists SKUs highest-revenue-first.",
      meta: "Product costs page",
      href: "/costs",
    });
  }
  if (contribution?.layers?.some((l) => !l.hasSource)) {
    const missing = contribution.layers.filter((l) => !l.hasSource).map((l) => l.label);
    out.push({
      id: "action:connect-cost-sources",
      title: "Connect the missing cost sources",
      description: `No data source for: ${missing.join(", ")}. Each one is a real cost currently counted as zero, so margin is overstated.`,
      meta: "Connections page",
      href: "/connections",
    });
  }
  if (freshness && freshness.staleSources > 0) {
    out.push({
      id: "action:resync-stale",
      title: `Re-sync ${freshness.staleSources} stale source${freshness.staleSources === 1 ? "" : "s"}`,
      description:
        "No full sync in over 24 hours. Webhook-fed connectors may still be current — this tracks full syncs, which now run on a schedule, so a source stale for much longer than its interval is worth a look.",
      meta: "Connections page",
      href: "/connections",
    });
  }
  if (products && products.skuCount > 0 && products.costedSkuCount === 0) {
    out.push({
      id: "action:review-top-skus",
      title: "Review your top SKUs by revenue",
      description: `${products.skuCount} SKUs sold this period. Costing just the top few by revenue gets contribution margin most of the way there.`,
      meta: "Product costs page",
      href: "/costs",
    });
  }
  return out;
}
