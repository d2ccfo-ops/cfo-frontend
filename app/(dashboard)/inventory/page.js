"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import Metric from "@/components/ui/Metric";
import StatusBadge from "@/components/ui/StatusBadge";
import DataFreshnessBadge from "@/components/ui/DataFreshnessBadge";
import EvidenceDrawer from "@/components/ui/EvidenceDrawer";
import AbbrCurrency from "@/components/ui/AbbrCurrency";
import TableSkeleton from "@/components/ui/TableSkeleton";

// No mock rows here any more. This page used to fall back to seven invented
// products ("Vitamin C Serum 30ml" and friends) whenever the fetch hadn't
// landed, which is the one thing a finance dashboard must never do — a founder
// cannot tell a placeholder from a reading. Skeletons cover the loading state
// and an explicit message covers failure.

// The underlying daysOfCover figure is a real computed number (inventoryQty
// / dailyVelocity — see cfo-backend's modules/calc/inventory.ts) and can
// legitimately be enormous when a SKU has huge stock and near-zero recent
// sales (a synthetic/demo store trait, not a formatting bug) — a raw
// "408631 days" isn't useful to a human, so this clips the *display* to
// years past a year, without touching the real number the backend returns.
function formatDaysOfCover(days) {
  if (days == null) return "—";
  if (days >= 365) return `${(days / 365).toFixed(1)}+ yrs`;
  return `${Math.round(days)} days`;
}

// Maps cfo-backend's real per-SKU status (modules/calc/inventory.ts's
// InventoryCoverStatus) to this page's StatusBadge tone + label.
const STATUS_DISPLAY = {
  stockout_risk: { tone: "negative", label: "Stockout risk" },
  out_of_stock: { tone: "negative", label: "Out of stock" },
  slow_moving: { tone: "warning", label: "Slow-moving" },
  unknown: { tone: "neutral", label: "No SKU data" },
  healthy: { tone: "positive", label: "Healthy" },
};

// Order matches STATUS_PRIORITY on the backend (routes/inventory.ts) — most
// urgent first — so the dropdown reads the same way the rollup logic does.
const COVER_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "stockout_risk", label: "Stockout risk" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "slow_moving", label: "Slow-moving" },
  { value: "healthy", label: "Healthy" },
  { value: "unknown", label: "No SKU data" },
];

const SEARCH_DEBOUNCE_MS = 350;

// Rows per request. The catalogue is 1,601 products; sending it whole was a
// 6.12 MB response, most of it stored Shopify payloads nothing on screen reads.
const PAGE_SIZE = 100;
// Fetch the next page while the sentinel is still this far below the fold, so
// the list stays ahead of the scroll instead of stalling at the bottom.
const PREFETCH_MARGIN_PX = 600;

export default function InventoryPage() {
  const { getToken } = useAuth();
  const [liveInventoryValue, setLiveInventoryValue] = useState(null);
  const [liveCover, setLiveCover] = useState(null);
  const [metricsFailed, setMetricsFailed] = useState(false);
  const [liveProducts, setLiveProducts] = useState(null); // null = not loaded yet, [] = loaded but empty
  const [productTypes, setProductTypes] = useState([]);
  // Pagination state. `total` is the count MATCHING the active filters, not the
  // catalogue size, so "100 of 412" stays honest while a filter is on.
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // Guards against the observer firing again while a page is already in flight
  // — a ref rather than state because it must be accurate synchronously, before
  // React has re-rendered.
  const fetchingRef = useRef(false);
  const sentinelRef = useRef(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [productTypeFilter, setProductTypeFilter] = useState("all");
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  // Debounced separately from searchInput so typing doesn't fire a backend
  // request per keystroke — only once the user pauses for 350ms.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  // The four metric cards summarize the *whole* catalog and deliberately
  // ignore the product table's filters below (a "days of cover" average
  // that changed depending on what someone typed into search would be
  // actively misleading) — fetched once, independent of filter state.
  useEffect(() => {
    let cancelled = false;
    async function loadCards() {
      try {
        const token = await getToken();
        const [valueRes, coverRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/metrics/inventory-value`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/metrics/inventory-cover`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (cancelled) return;
        if (valueRes.ok) setLiveInventoryValue(await valueRes.json());
        if (coverRes.ok) setLiveCover(await coverRes.json());
      } catch {
        // Cards render their "No data" state. This flag separates "nothing is
        // connected" from "we could not ask", which used to look identical.
        if (!cancelled) setMetricsFailed(true);
      }
    }
    loadCards();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  // "Stock by product" table. Every filter is a query param — search, cover
  // status and product type all resolve on the backend BEFORE the page is cut,
  // so infinite scroll walks only the matching rows. Filtering in the browser
  // would mean downloading the whole catalogue to hide most of it, which is the
  // cost this is built to avoid.
  const buildUrl = useCallback(
    (cursor) => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (productTypeFilter !== "all") params.set("productType", productTypeFilter);
      params.set("limit", String(PAGE_SIZE));
      if (cursor) params.set("cursor", cursor);
      return `${process.env.NEXT_PUBLIC_API_URL}/inventory?${params.toString()}`;
    },
    [search, statusFilter, productTypeFilter],
  );

  // First page, refetched from scratch whenever a filter changes. Resetting the
  // accumulated list here is what stops results from two different filters
  // being concatenated into one nonsense table.
  useEffect(() => {
    let cancelled = false;
    async function loadFirstPage() {
      fetchingRef.current = true;
      setLiveProducts(null);
      setLoadFailed(false);
      try {
        const token = await getToken();
        const res = await fetch(buildUrl(null), { headers: { Authorization: `Bearer ${token}` } });
        if (cancelled) return;
        if (!res.ok) {
          setLoadFailed(true);
          setLiveProducts([]);
          return;
        }
        const data = await res.json();
        setLiveProducts(data.products);
        setTotal(data.total ?? data.products.length);
        setNextCursor(data.nextCursor ?? null);
        // Only sent with the first page — the dropdown doesn't change as you
        // scroll, so the backend skips the DISTINCT scan on later requests.
        if (data.filters?.productTypes) setProductTypes(data.filters.productTypes);
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
          setLiveProducts([]);
        }
      } finally {
        fetchingRef.current = false;
      }
    }
    loadFirstPage();
    return () => {
      cancelled = true;
    };
  }, [getToken, buildUrl]);

  const loadNextPage = useCallback(async () => {
    if (fetchingRef.current || !nextCursor) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    try {
      const token = await getToken();
      const res = await fetch(buildUrl(nextCursor), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        // Appended, never replaced. Keyset paging guarantees the server won't
        // repeat a row, so there's no de-duplication to do here.
        setLiveProducts((cur) => [...(cur ?? []), ...data.products]);
        setNextCursor(data.nextCursor ?? null);
        if (typeof data.total === "number") setTotal(data.total);
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

  // Infinite scroll. An IntersectionObserver on a sentinel below the last row,
  // rather than a scroll listener — no per-frame work, and it fires just as
  // correctly when the viewport is tall enough that the first page doesn't fill
  // it (a scroll handler would sit there waiting for a scroll that never comes).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadNextPage();
      },
      { rootMargin: `${PREFETCH_MARGIN_PX}px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nextCursor, loadNextPage]);

  const isFiltering = search !== "" || statusFilter !== "all" || productTypeFilter !== "all";

  // One row per product, variants rolled up — status/daysOfCover come
  // straight from the backend's per-product rollup (routes/inventory.ts),
  // computed from the exact same per-SKU velocity data the cards above use,
  // so the table and the cards can never disagree with each other. Mock
  // ROWS only ever stand in for the unfiltered, not-yet-loaded state — once
  // a filter is active, an empty live result should read as "no matches,"
  // not silently show unrelated mock products.
  const rows = (liveProducts ?? []).map((p) => {
    const units = p.variants.reduce((sum, v) => sum + v.inventoryQuantity, 0);
    const valueMinor = p.variants.reduce((sum, v) => sum + BigInt(v.price) * BigInt(v.inventoryQuantity), 0n);
    const display = STATUS_DISPLAY[p.status] ?? STATUS_DISPLAY.unknown;
    return {
      id: p.id,
      name: p.title,
      units: units.toLocaleString("en-IN"),
      valueRaw: Number(valueMinor) / 100,
      // The velocity that produced every days-of-cover figure — hidden before,
      // which left "34 days" unverifiable at a glance.
      sold30d: (p.unitsSoldTrailing30d ?? 0).toLocaleString("en-IN"),
      cover: formatDaysOfCover(p.daysOfCover),
      tone: display.tone,
      label: display.label,
      // The status is a five-branch classifier over stock and 30-day sales
      // velocity, not a field on the product — so the badge explains which
      // branch this SKU fell into and what the threshold was.
      term: `status-${p.status.replaceAll("_", "-")}`,
    };
  });

  return (
    <>
      <TopNav
        title="Inventory"
        // Says outright that the header's date filter doesn't reach this page.
        // Every figure here reads current stock levels, and nothing keeps a
        // history of those (see periodFiltered: false in the backend's
        // modules/calc/inventory.ts) — so a range can't be honoured, and
        // silently ignoring it would leave the picker implying otherwise.
        subtitle="Stock cover and working-capital exposure · current stock, not affected by the date filter"
        actions={
          <>
            <DataFreshnessBadge />
            <button className="btn btn-secondary" type="button" onClick={() => setEvidenceOpen(true)}>
              View evidence
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {liveInventoryValue ? (
            <Metric
              label="Inventory value"
              value={<AbbrCurrency value={liveInventoryValue.value} />}
              change={`${liveInventoryValue.unitsOnHand.toLocaleString("en-IN")} units, ${liveInventoryValue.variantCount} SKUs`}
              tone="neutral"
              sub="Live, no prior-period figure yet"
            />
          ) : (
            // Every one of these four fallbacks used to be a fabricated figure
            // (₹38.6 L, 42 days, 4 SKUs, ₹6.4 L) shown whenever the fetch failed
            // or nothing was connected — indistinguishable from the live card
            // beside it. A card with no data says so.
            <Metric label="Inventory value" value="No data" change={metricsFailed ? "Backend unreachable" : "Connect a sales channel"} tone="neutral" sub={metricsFailed ? "The request to cfo-backend failed" : "Retail price × quantity on hand"} />
          )}
          {liveCover ? (
            <Metric
              label="Avg. days of cover"
              value={formatDaysOfCover(liveCover.avgDaysOfCover)}
              change={`${liveCover.windowDays}-day sales window`}
              tone="neutral"
              sub="Value-weighted, live"
            />
          ) : (
            <Metric label="Avg. days of cover" value="No data" change={metricsFailed ? "Backend unreachable" : "Connect a sales channel"} tone="neutral" sub={metricsFailed ? "The request to cfo-backend failed" : "Stock on hand ÷ daily sales velocity"} />
          )}
          {liveCover ? (
            // Clickable: the card names a count, the click shows the SKUs
            // behind it — before, the specific at-risk products were only
            // reachable by knowing to use the status dropdown.
            <button
              type="button"
              className="text-left"
              onClick={() => setStatusFilter("stockout_risk")}
              title="Show these SKUs in the table below"
            >
              <Metric
                label="SKUs at risk of stockout"
                value={`${liveCover.skusAtStockoutRisk.count} SKUs`}
                change="Within 14 days"
                tone={liveCover.skusAtStockoutRisk.count > 0 ? "negative" : "positive"}
                sub="Live, real sales velocity — click to list them below"
              />
            </button>
          ) : (
            <Metric label="SKUs at risk of stockout" value="No data" change={metricsFailed ? "Backend unreachable" : "Connect a sales channel"} tone="neutral" sub={metricsFailed ? "The request to cfo-backend failed" : "SKUs with under 14 days of cover"} />
          )}
          {liveCover ? (
            <Metric
              label="Slow-moving stock value"
              value={<AbbrCurrency value={liveCover.slowMovingStockValue.value} />}
              change="90+ days on hand, or zero sales in 30d"
              tone={liveCover.slowMovingStockValue.count > 0 ? "warning" : "positive"}
              sub={`${liveCover.slowMovingStockValue.count} SKUs`}
            />
          ) : (
            <Metric label="Slow-moving stock value" value="No data" change={metricsFailed ? "Backend unreachable" : "Connect a sales channel"} tone="neutral" sub={metricsFailed ? "The request to cfo-backend failed" : "90+ days on hand, or zero sales in 30d"} />
          )}
        </div>

        <div className="gcard p-5">
          <div className="mb-2.5 text-base font-medium text-foreground">Stock by product</div>

          <div className="flex items-center gap-2.5 flex-wrap mb-3">
            <input
              className="input"
              style={{ maxWidth: 280 }}
              placeholder="Search product name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <select className="input" style={{ width: "auto" }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {COVER_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select className="input" style={{ width: "auto" }} value={productTypeFilter} onChange={(e) => setProductTypeFilter(e.target.value)}>
              <option value="all">All product types</option>
              {productTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Row count is stated up front. Without it an infinitely scrolling
              table gives no sense of how much is below, and a filtered view is
              indistinguishable from a broken one. */}
          <div className="mb-2 text-xs text-muted-foreground">
            {liveProducts === null
              ? "Loading…"
              : `Showing ${rows.length.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} product${total === 1 ? "" : "s"}${
                  isFiltering ? " matching these filters" : ""
                }`}
          </div>

          <table className="table">
            <thead>
              <tr><th>Product</th><th>Units on hand</th><th>Units sold (30d)</th><th>Inventory value</th><th>Days of cover</th><th>Status</th></tr>
            </thead>
            {/* null means "not loaded yet" (as opposed to [] = loaded and
                genuinely empty), which is the state that shows skeletons. */}
            {liveProducts === null ? (
              <TableSkeleton rows={8} columns={6} />
            ) : (
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td><td>{r.units}</td><td>{r.sold30d}</td><td><AbbrCurrency value={r.valueRaw} /></td><td>{r.cover}</td>
                    <td><StatusBadge status={r.tone} label={r.label} term={r.term} /></td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      {loadFailed
                        ? "Couldn't load products. Check that the backend is running."
                        : isFiltering
                          ? "No products match these filters."
                          : "No products yet — connect Shopify to sync your catalogue."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            )}
          </table>

          {/* The observer watches this, not the last row: keeping it outside the
              table means the trigger survives the rows being replaced when a
              filter changes. */}
          <div ref={sentinelRef} aria-hidden className="h-px" />

          {loadingMore ? (
            <div className="py-3 text-center text-xs text-muted-foreground">Loading more…</div>
          ) : null}
          {!loadingMore && liveProducts !== null && !nextCursor && rows.length > 0 ? (
            <div className="py-3 text-center text-xs text-muted-foreground">
              End of list · {rows.length.toLocaleString("en-IN")} product{rows.length === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>
      </div>

      <EvidenceDrawer
        open={evidenceOpen}
        title="Inventory value"
        sourceLabel="How stock cover and inventory value are calculated"
        // These describe what cfo-backend's modules/calc/inventory.ts actually
        // does. Two of them used to describe something else: the value line
        // claimed "landed cost" when stock is valued at RETAIL price (no cost
        // basis exists in the schema — that is the whole reason the Product
        // costs page exists), and stockout risk claimed 21 days against a real
        // threshold of 14. An evidence drawer that misstates the formula is
        // worse than none, since it is what a reader checks when a number
        // surprises them.
        rows={[
          { label: "Inventory value", value: "Sum of on-hand units × retail price per variant — not landed cost" },
          { label: "Why retail", value: "No cost basis exists per variant yet; entering costs is what the Product costs page is for" },
          { label: "Days of cover", value: `On-hand units ÷ daily velocity over a trailing ${liveCover?.windowDays ?? 30}-day sales window` },
          { label: "Stockout risk", value: "Days of cover below 14 days" },
          { label: "Slow-moving", value: "Over 90 days of cover, or zero sales in the window" },
        ]}
        onClose={() => setEvidenceOpen(false)}
      />
    </>
  );
}
