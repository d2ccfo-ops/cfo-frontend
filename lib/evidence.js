// Client for GET /evidence/:metricKey (§21). Fetches the backend's own
// account of a figure — definition, formula, verification status, sources and
// the first rows of the underlying population — and flattens it into the
// {label, value} rows EvidenceDrawer renders. §106: nothing here computes; it
// formats what the backend asserted.

const inr = (n) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function fetchEvidence(token, metricKey, dateQuery = "") {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/evidence/${metricKey}${dateQuery}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`evidence ${metricKey}: ${res.status}`);
  return res.json();
}

// One sample row → one drawer line. The identifying field goes left, the money
// right; which fields those are varies by metric, so this probes in order.
function sampleToRow(s) {
  const label =
    s.orderNumber != null
      ? `${s.orderNumber}${s.sku ? ` · ${s.sku}` : ""}${s.channel ? ` · ${s.channel}` : ""}`
      : s.sku != null
        ? `${s.sku}${s.units != null ? ` · ${s.units} units` : ""}`
        : s.valueDate != null
          ? `${new Date(s.valueDate).toLocaleDateString("en-IN")}${s.description ? ` · ${s.description}` : ""}`
          : s.date != null
            ? new Date(s.date).toLocaleDateString("en-IN")
            : "row";
  const amount =
    s.amountRupees ?? s.cm0Rupees ?? s.netRevenueRupees ?? s.closingRupees ?? s.cogsRupees ?? null;
  return { label, value: inr(amount) };
}

/**
 * Flatten the envelope. `includeText: false` drops definition/formula for
 * drawers that already carry their own definition rows (the revenue ladder's).
 */
export function evidenceToRows(envelope, { includeText = true } = {}) {
  const rows = [];
  if (includeText) {
    rows.push({ label: "What this is", value: envelope.definition, block: true });
    rows.push({ label: "Formula", value: envelope.formula, block: true });
  }
  rows.push({
    label: "Verification",
    value: `${envelope.reconciliationStatus.status.toUpperCase()} — ${envelope.reconciliationStatus.reasons.join(" ")}`,
    block: true,
  });
  rows.push({ label: "Formula version", value: envelope.formulaVersion });
  rows.push({
    label: "Period",
    value: envelope.period.periodFiltered
      ? `${new Date(envelope.period.from).toLocaleDateString("en-IN")} – ${new Date(envelope.period.to).toLocaleDateString("en-IN")}`
      : "Not period-filtered (point-in-time / forward-looking)",
  });
  rows.push({ label: "Completeness", value: envelope.completeness, block: true });
  for (const s of envelope.sources ?? []) {
    rows.push({ label: `Source · ${s.label}`, value: s.detail });
  }
  for (const [i, w] of (envelope.warnings ?? []).entries()) {
    rows.push({ label: `Caveat ${i + 1}`, value: w, block: true });
  }
  const samples = envelope.sampleTransactions ?? [];
  rows.push({
    label: "Underlying rows",
    value: `${envelope.transactionCount.toLocaleString("en-IN")} in total — first ${samples.length} below`,
  });
  for (const s of samples) rows.push(sampleToRow(s));
  return rows;
}

// The CSV needs the Bearer token, so a plain <a href> can't fetch it — pull
// the blob and hand it to a synthetic anchor instead.
export async function downloadEvidenceCsv(token, metricKey, dateQuery = "") {
  const joiner = dateQuery ? "&" : "?";
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/evidence/${metricKey}${dateQuery}${joiner}format=csv`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`evidence csv ${metricKey}: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `evidence-${metricKey}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
