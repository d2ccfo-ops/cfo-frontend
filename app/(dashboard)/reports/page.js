"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import NoDataPanel from "@/components/ui/NoDataPanel";

// P5.3 (§20.14). Reports that exist.
//
// What this replaced: six reports each stamped "Updated 1 hour ago" beside a
// live-looking Export button, plus three scheduled sends to real-looking
// addresses ("ca@sharmaassociates.in", next send 1 Sep 2026). No endpoint
// existed. A founder would reasonably have believed their CA was receiving a
// monthly P&L. Nothing was being sent, ever.
//
// Four reports are built, and they are deliberately the four that can be
// produced honestly from data this system holds. The three that cannot —
// P&L, balance sheet, cash-flow statement — are still listed below as
// unavailable with the reason, because "we don't do that" is more useful than
// silence to someone deciding whether this replaces their accountant.
//
// Periods come from the server, keyed. "August 2026" is a thing a person
// files; "1 Aug to 31 Aug" is a window someone typed. Two people running "the
// August report" must get the same document.

const BLOCKED = [
  {
    title: "Profit & loss",
    blockedBy:
      "Needs an accounting feed. Operating costs — payroll, rent, professional fees — never touch a Shopify order, so a P&L built from this data would omit most of the expenses and overstate profit by all of them.",
  },
  {
    title: "Balance sheet",
    blockedBy: "Assets, liabilities and equity have no source in this product. §7 puts the accounting layer out of V1.",
  },
  {
    title: "Cash-flow statement",
    blockedBy:
      "Needs a connected bank account with full history. The margin summary and settlement report cover what is knowable today.",
  },
  {
    title: "GST summary",
    blockedBy:
      "Output GST is already computed per order in the revenue ladder. Input tax credit needs purchase invoices, which need an accounting feed.",
  },
];

export default function ReportsPage() {
  const { getToken } = useAuth();
  const api = process.env.NEXT_PUBLIC_API_URL;

  const [catalogue, setCatalogue] = useState(null);
  const [period, setPeriod] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${api}/reports`, { headers: { Authorization: `Bearer ${await getToken()}` } });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const body = await res.json();
      setCatalogue(body);
      setPeriod(body.periods?.[0]?.key ?? "");
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [api, getToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function openPreview(kind) {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`${api}/reports/${kind}?period=${encodeURIComponent(period)}`, {
        headers: { Authorization: `Bearer ${await getToken()}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? `Could not build that report (HTTP ${res.status}).`);
        return;
      }
      setPreview(await res.json());
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  async function download(kind) {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`${api}/reports/${kind}?period=${encodeURIComponent(period)}&format=csv`, {
        headers: { Authorization: `Bearer ${await getToken()}` },
      });
      if (!res.ok) {
        setError(`Could not export that report (HTTP ${res.status}).`);
        return;
      }
      // Fetched with the bearer token and turned into a blob rather than
      // linked directly: the API needs the Authorization header, which an
      // <a href> cannot carry.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind}-${period}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  const reports = catalogue?.reports ?? [];
  const periods = catalogue?.periods ?? [];
  const selected = periods.find((p) => p.key === period);

  return (
    <>
      <TopNav
        title="Reports"
        subtitle={
          catalogue
            ? `Financial year starts in month ${catalogue.fiscalYearStartMonth} · every export carries its own data-status label`
            : "Exports, stamped with what they can and cannot tell you"
        }
        actions={
          periods.length > 0 ? (
            <select className="input" style={{ maxWidth: 220 }} value={period} onChange={(e) => setPeriod(e.target.value)}>
              {periods.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          ) : null
        }
      />

      <div className="flex flex-col gap-6">
        {error ? (
          <div className="rounded-md bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive" role="alert">
            {error}
          </div>
        ) : null}

        {failed ? (
          <NoDataPanel
            tone="error"
            title="Could not reach the server"
            reason="The report catalogue could not be loaded. This is a connection failure, not an absence of reports."
          />
        ) : loading ? (
          <div className="gcard h-32 animate-pulse p-5" role="status" aria-busy="true">
            <span className="sr-only">Loading reports</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {reports.map((r) => (
              <div key={r.kind} className="gcard p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div style={{ maxWidth: 620 }}>
                    <div className="text-[15px] font-medium text-foreground">{r.title}</div>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{r.description}</p>
                    {/* The caveat is on the card, not behind the download.
                        Someone who reads it here does not file the wrong
                        document; someone who reads it in the CSV already has. */}
                    <p className="mt-2 rounded-md bg-accent-soft px-3 py-2 text-[12.5px] leading-relaxed text-accent">
                      {r.caveat}
                    </p>
                    <div className="mt-2 text-[11.5px] text-muted-foreground">
                      {r.periodScoped ? `Scoped to ${selected?.label ?? "the selected period"}` : "Point-in-time — ignores the period above"}
                    </div>
                  </div>
                  <div className="flex flex-none gap-2">
                    <button type="button" className="btn btn-secondary" disabled={busy === r.kind} onClick={() => openPreview(r.kind)}>
                      {busy === r.kind ? "Working…" : "Preview"}
                    </button>
                    <button type="button" className="btn btn-primary" disabled={busy === r.kind} onClick={() => download(r.kind)}>
                      Export CSV
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {preview ? (
          <div className="gcard p-5">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[15px] font-medium text-foreground">
                {preview.title}
                {preview.period ? ` · ${preview.period.label}` : ""}
              </div>
              <button
                type="button"
                className="cursor-pointer border-none bg-transparent p-0 text-[12.5px] text-primary"
                onClick={() => setPreview(null)}
              >
                Close
              </button>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-3 text-[11.5px] text-muted-foreground">
              <span>formula {preview.formulaVersion}</span>
              {preview.dataStatus?.status ? <span>· data status: {preview.dataStatus.status}</span> : null}
              <span>· {preview.rows.length} rows</span>
            </div>

            {preview.warnings?.length > 0 ? (
              <div className="mb-3 flex flex-col gap-1.5">
                {preview.warnings.map((w, i) => (
                  <div key={i} className="rounded-md bg-destructive-soft px-3 py-2 text-[12.5px] text-destructive">
                    {w}
                  </div>
                ))}
              </div>
            ) : null}

            {preview.rows.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No rows for this period. That is a fact about the period, not a failure — check the period selector above.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      {Object.keys(
                        preview.rows.reduce((acc, r) => ({ ...acc, ...r }), {})
                      ).map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 50).map((row, i) => {
                      const headers = Object.keys(preview.rows.reduce((acc, r) => ({ ...acc, ...r }), {}));
                      return (
                        <tr key={i}>
                          {headers.map((h) => (
                            <td key={h} className="text-[12.5px]">
                              {row[h] === null || row[h] === undefined ? "—" : String(row[h])}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {preview.rows.length > 50 ? (
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    Showing the first 50 of {preview.rows.length} rows. The CSV has all of them.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        <div className="gcard p-5">
          <div className="mb-1 text-base font-medium text-foreground">Not available, and why</div>
          <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
            These are the reports people expect from a finance system. Shipping a half-derived version under one of
            these names is how a founder files something wrong, so they are named here instead of built.
          </p>
          <div className="flex flex-col gap-2">
            {BLOCKED.map((b) => (
              <div key={b.title} className="border-b border-border pb-2 last:border-0">
                <div className="text-[13px] font-medium text-foreground">{b.title}</div>
                <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{b.blockedBy}</div>
              </div>
            ))}
          </div>
        </div>

        <NoDataPanel
          title="Scheduled sends"
          reason="No report is emailed on a schedule. The previous version of this page listed three, with next-send dates, to addresses that looked real — nothing was ever sent. Daily and weekly digests of what changed do go out, if configured, from Settings."
          action="Configure digests"
          href="/settings"
        />
      </div>
    </>
  );
}
