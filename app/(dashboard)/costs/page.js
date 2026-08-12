"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import Metric from "@/components/ui/Metric";
import StatusBadge from "@/components/ui/StatusBadge";
import AbbrCurrency from "@/components/ui/AbbrCurrency";
import TableSkeleton from "@/components/ui/TableSkeleton";

// Product cost entry — the input that unblocks contribution margin (§115 names
// it one of the three numbers that must be right). No connector can supply it
// for every merchant: Shopify's "Cost per item" is optional and frequently
// blank, so manual and bulk entry are first-class paths rather than a fallback.
//
// SKUs are listed WORST-FIRST BY REVENUE, not alphabetically. With hundreds of
// SKUs, entering costs alphabetically means doing a lot of work before the
// margin number moves at all; the top few SKUs usually carry most of the value.

function parseCsv(text) {
  // Deliberately tiny: sku,cost[,freight,duty,other]. A real CSV parser would
  // be overkill for a format whose whole point is that a founder can paste two
  // columns out of a spreadsheet.
  const rows = [];
  const errors = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const parts = line.split(/[,\t]/).map((p) => p.trim());
    if (parts.length < 2) return;
    const [sku, cost, freight, duty, other] = parts;
    // Skip an obvious header row rather than reporting it as an error.
    if (i === 0 && Number.isNaN(Number(cost))) return;
    const purchaseCost = Number(cost);
    if (!sku || Number.isNaN(purchaseCost) || purchaseCost < 0) {
      errors.push(`Line ${i + 1}: "${line.slice(0, 40)}" — need sku,cost`);
      return;
    }
    rows.push({
      sku,
      purchaseCost,
      inboundFreight: Number(freight) || 0,
      importDuty: Number(duty) || 0,
      otherCost: Number(other) || 0,
    });
  });
  return { rows, errors };
}

const SEARCH_DEBOUNCE_MS = 350;
const SKU_PAGE_SIZE = 100;

const SKU_STATUS_OPTIONS = [
  { value: "missing", label: "Without a cost" },
  { value: "costed", label: "Already costed" },
  { value: "all", label: "All SKUs" },
];

export default function CostsPage() {
  const { getToken } = useAuth();
  const [coverage, setCoverage] = useState(null);
  // SKU work queue — searched, filtered and paged on the server. The old table
  // was a fixed top-100 slice with no way to reach the other 629 uncosted SKUs.
  const [skus, setSkus] = useState(null);
  const [skuTotal, setSkuTotal] = useState(0);
  const [skuHasMore, setSkuHasMore] = useState(false);
  const [loadingSkus, setLoadingSkus] = useState(true);
  const [loadingMoreSkus, setLoadingMoreSkus] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [skuStatus, setSkuStatus] = useState("missing");
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [csv, setCsv] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // `loading` starts true, so this deliberately does NOT setLoading(true) up
  // front — a synchronous setState in an effect body triggers a cascading
  // render and is a lint error under the current React rules. Saving updates
  // `coverage` from the mutation's own response instead of re-fetching, so
  // there's no refresh path that needs to flip loading back on.
  useEffect(() => {
    let cancelled = false;
    async function loadCoverage() {
      try {
        const token = await getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/costs/coverage`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.ok) setCoverage(await res.json());
        else setError("Couldn't load cost coverage.");
      } catch {
        if (!cancelled) setError("Couldn't reach the backend.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadCoverage();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const buildSkuUrl = useCallback(
    (offset) => {
      const params = new URLSearchParams({ status: skuStatus, limit: String(SKU_PAGE_SIZE), offset: String(offset) });
      if (search) params.set("search", search);
      return `${process.env.NEXT_PUBLIC_API_URL}/costs/skus?${params.toString()}`;
    },
    [search, skuStatus],
  );

  // Returns the payload rather than setting state itself, so the caller decides
  // whether this is a fresh load (skeletons) or a silent refresh after a save.
  const fetchSkus = useCallback(
    async (offset) => {
      const token = await getToken();
      const res = await fetch(buildSkuUrl(offset), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      return res.json();
    },
    [getToken, buildSkuUrl],
  );

  // Reload from the top whenever the search or status filter changes. Note the
  // setState calls live inside the async function, not the effect body — a
  // synchronous setState in an effect is a lint error under the current React
  // rules and causes a cascading render.
  useEffect(() => {
    let cancelled = false;
    async function loadFirstPage() {
      setLoadingSkus(true);
      try {
        const data = await fetchSkus(0);
        if (cancelled || !data) return;
        setSkus(data.skus);
        setSkuTotal(data.total);
        setSkuHasMore(data.hasMore);
      } catch {
        // Coverage cards above still render; the table shows its empty state.
      } finally {
        if (!cancelled) setLoadingSkus(false);
      }
    }
    loadFirstPage();
    return () => {
      cancelled = true;
    };
  }, [fetchSkus]);

  // Silent refresh after saving — no skeleton flash, the rows just update.
  const refreshSkus = useCallback(async () => {
    try {
      const data = await fetchSkus(0);
      if (!data) return;
      setSkus(data.skus);
      setSkuTotal(data.total);
      setSkuHasMore(data.hasMore);
    } catch {
      // Keep what's on screen.
    }
  }, [fetchSkus]);

  async function loadMoreSkus() {
    if (loadingMoreSkus || !skuHasMore) return;
    setLoadingMoreSkus(true);
    try {
      const data = await fetchSkus(skus?.length ?? 0);
      if (data) {
        setSkus((cur) => [...(cur ?? []), ...data.skus]);
        setSkuHasMore(data.hasMore);
        setSkuTotal(data.total);
      }
    } catch {
      // Leave what's already loaded on screen.
    } finally {
      setLoadingMoreSkus(false);
    }
  }

  async function submit(costs, source) {
    if (costs.length === 0) return;
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/costs/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ costs, source }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.issues?.[0]?.message ?? "Save failed.");
        return;
      }
      setResult(body);
      setCoverage(body.coverage);
      setDrafts({});
      setCsv("");
      // Saved SKUs should drop out of the "without a cost" view immediately.
      refreshSkus();
    } catch {
      setError("Couldn't reach the backend.");
    } finally {
      setSaving(false);
    }
  }

  const draftRows = Object.entries(drafts)
    .filter(([, v]) => v !== "" && !Number.isNaN(Number(v)) && Number(v) >= 0)
    .map(([sku, v]) => ({ sku, purchaseCost: Number(v) }));

  const csvParsed = csv.trim() ? parseCsv(csv) : { rows: [], errors: [] };

  return (
    <>
      <TopNav
        title="Product costs"
        subtitle="Landed cost per SKU · unblocks contribution margin"
        actions={
          coverage ? (
            <StatusBadge
              status={coverage.valueCoveragePct >= 95 ? "positive" : coverage.valueCoveragePct > 0 ? "warning" : "negative"}
              label={`${coverage.valueCoveragePct}% of order value costed`}
            />
          ) : null
        }
      />

      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric
            label="Value coverage"
            value={coverage ? `${coverage.valueCoveragePct}%` : "—"}
            change={coverage ? `${coverage.lineCoveragePct}% of lines` : ""}
            tone={coverage?.valueCoveragePct >= 95 ? "positive" : "warning"}
            sub="Contribution margin stays INCOMPLETE below 95%"
          />
          <Metric
            label="SKUs missing a cost"
            value={coverage ? coverage.missingSkuCount.toLocaleString("en-IN") : "—"}
            tone={coverage?.missingSkuCount > 0 ? "warning" : "positive"}
            sub="Listed below, highest revenue first"
          />
          <Metric
            label="Order lines costed"
            value={coverage ? `${coverage.costedLines.toLocaleString("en-IN")} / ${coverage.totalLines.toLocaleString("en-IN")}` : "—"}
            tone="neutral"
            sub="Cost is snapshot onto each line at the order's date (§19)"
          />
        </div>

        {error ? <div className="gcard border-destructive/40 p-4 text-sm text-destructive">{error}</div> : null}
        {result ? (
          <div className="gcard p-4 text-sm text-foreground">
            Saved {result.saved} cost{result.saved === 1 ? "" : "s"}.{" "}
            {result.stamped
              ? `Stamped ${result.stamped.linesStamped.toLocaleString("en-IN")} order lines; ${result.stamped.linesUncosted.toLocaleString("en-IN")} still uncosted.`
              : null}
          </div>
        ) : null}

        <div className="gcard p-5">
          <div className="mb-1 text-base font-medium text-foreground">Bulk paste</div>
          <div className="mb-3 text-xs text-muted-foreground">
            One row per SKU: <code>sku,cost</code> — optionally <code>sku,cost,freight,duty,other</code> for the full §19
            landed cost. Paste straight from a spreadsheet. Costs apply to your whole order history unless you set a
            date later.
          </div>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={"BR-DHAN V-1,320\nRD-7F,180,12\nBS-10.26,45000"}
            className="w-full rounded-md border border-border bg-card p-3 font-mono text-[13px] text-foreground outline-none focus:border-primary"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || csvParsed.rows.length === 0}
              onClick={() => submit(csvParsed.rows, "CSV_IMPORT")}
            >
              {saving ? "Saving…" : `Save ${csvParsed.rows.length} cost${csvParsed.rows.length === 1 ? "" : "s"}`}
            </button>
            {csvParsed.errors.length > 0 ? (
              <span className="text-xs text-destructive">
                {csvParsed.errors.length} row{csvParsed.errors.length === 1 ? "" : "s"} skipped — {csvParsed.errors[0]}
              </span>
            ) : null}
          </div>
        </div>

        <div className="gcard p-5">
          <div className="mb-1 text-base font-medium text-foreground">
            {skuStatus === "costed" ? "SKUs with a cost" : skuStatus === "all" ? "All SKUs" : "SKUs without a cost"}
          </div>
          <div className="mb-3 text-xs text-muted-foreground">
            Ranked by the revenue they represent — entering the top few moves the margin most.
            {" "}Search matches SKU code or product name.
          </div>

          {/* Both controls hit the backend. Filtering a fetched list in the
              browser would mean downloading every SKU to hide most of them,
              and the list is deliberately paged for exactly that reason. */}
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <input
              className="input"
              style={{ maxWidth: 280 }}
              placeholder="Search SKU or product name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <select
              className="input"
              style={{ width: "auto" }}
              value={skuStatus}
              onChange={(e) => setSkuStatus(e.target.value)}
            >
              {SKU_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              {loadingSkus
                ? "Loading…"
                : `Showing ${(skus?.length ?? 0).toLocaleString("en-IN")} of ${skuTotal.toLocaleString("en-IN")}`}
            </span>
          </div>

          <table className="table">
            <thead>
              <tr><th>SKU</th><th>Product</th><th>Revenue</th><th>Units</th><th>Avg. selling price</th><th>Landed cost (₹)</th></tr>
            </thead>
            {loadingSkus ? (
              <TableSkeleton rows={8} columns={6} />
            ) : (
              <tbody>
                {(skus ?? []).map((s) => {
                  const avg = s.units > 0 ? s.revenue / s.units : 0;
                  return (
                    <tr key={s.sku}>
                      <td className="font-mono text-[12.5px]">{s.sku}</td>
                      <td className="max-w-[220px] truncate" title={s.productName}>{s.productName}</td>
                      <td><AbbrCurrency value={s.revenue} /></td>
                      <td>{s.units.toLocaleString("en-IN")}</td>
                      <td><AbbrCurrency value={Math.round(avg)} /></td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={drafts[s.sku] ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [s.sku]: e.target.value }))}
                          // The cost already on file shows as the placeholder,
                          // so an existing entry can be found and corrected
                          // rather than only ever added blind.
                          placeholder={s.landedCost != null ? String(s.landedCost) : "—"}
                          className="w-28 rounded-md border border-border bg-card px-2 py-1 text-[13px] text-foreground outline-none focus:border-primary disabled:opacity-40"
                        />
                      </td>
                    </tr>
                  );
                })}
                {(skus?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      {search
                        ? `No SKU matches "${search}"${skuStatus === "missing" ? " among those without a cost" : ""}.`
                        : skuStatus === "missing"
                          ? "Every order line has a cost. Contribution margin is measurable."
                          : "No SKUs yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            )}

          {skuHasMore ? (
            <tfoot>
              <tr>
                <td colSpan={6} className="py-3 text-center">
                  <button type="button" className="btn btn-secondary" onClick={loadMoreSkus} disabled={loadingMoreSkus}>
                    {loadingMoreSkus ? "Loading…" : `Load ${Math.min(SKU_PAGE_SIZE, skuTotal - (skus?.length ?? 0))} more`}
                  </button>
                </td>
              </tr>
            </tfoot>
          ) : null}
          </table>

          {draftRows.length > 0 ? (
            <div className="mt-4 flex items-center gap-3">
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => submit(draftRows, "MANUAL")}>
                {saving ? "Saving…" : `Save ${draftRows.length} cost${draftRows.length === 1 ? "" : "s"}`}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setDrafts({})} disabled={saving}>
                Clear
              </button>
              {/* Drafts are keyed by SKU and survive searching, so costs typed
                  across several searches all save together. Said out loud
                  because the rows they were typed into are no longer visible. */}
              <span className="text-xs text-muted-foreground">
                Includes costs typed under earlier searches.
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
