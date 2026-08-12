"use client";

import { formatInr } from "@/lib/money";

// §14 campaign profitability (P6.6).
//
// SPEND IS MEASURED. EVERYTHING ELSE IS QUOTED.
//
// Every ad platform reports conversions and conversion value against its own
// attribution model. Meta counts a purchase within 7 days of a click or 1 day
// of a view — including one where the customer actually arrived through Google
// an hour later. Google counts that same purchase. Add them and a brand doing
// ₹1 Cr sees ₹1.6 Cr of "attributed revenue".
//
// So the ROAS column is rendered as the platform's claim, in muted type, with
// the caveat attached — never as a figure this product asserts. Spend and cost
// per click are the platform's billing record rather than its model, so those
// render as facts.

export default function CampaignProfitability({ data, loading }) {
  if (loading) {
    return (
      <div className="gcard p-5" role="status" aria-busy="true">
        <span className="sr-only">Loading campaign profitability</span>
        <div className="mb-4 h-4 w-1/3 animate-pulse rounded-sm bg-primary/10" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="mb-2 h-9 animate-pulse rounded-sm bg-primary/10" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  // An org whose connector pulls account-day grain only. Says so rather than
  // rendering an empty table, which would read as "no campaigns running".
  if (!data.hasSource) {
    return (
      <div className="gcard p-5">
        <h3 className="text-[15px] font-medium text-foreground">Spend by campaign</h3>
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--color-accent)" }}>
          {data.warnings[0]}
        </p>
        {Number(data.accountTotalSpendMinor) > 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground">
            {formatInr(Number(data.accountTotalSpendMinor))} of ad spend is recorded for this period — it just is not
            broken down.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="gcard p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-medium text-foreground">Spend by campaign</h3>
        <span className="text-[13px] text-foreground">{formatInr(Number(data.totalSpendMinor))}</span>
      </div>

      {/* Coverage stated whenever it is not complete. A ranking built on a
          partial pull ranks the wrong things, and the reader cannot know that
          from the table itself. */}
      {!data.reconciles ? (
        <p className="mt-1 text-[12px]" style={{ color: "var(--color-accent)" }}>
          Covers {data.coveragePct}% of recorded ad spend — campaigns outside this pull could be larger than anything
          shown.
        </p>
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <th>Campaign</th>
              <th className="text-right">Spend</th>
              <th className="text-right">Share</th>
              <th className="text-right">CPC</th>
              <th className="text-right">Platform ROAS</th>
            </tr>
          </thead>
          <tbody>
            {data.campaigns.map((c) => (
              <tr key={`${c.provider}-${c.campaignId}`}>
                <td>
                  <span className="text-[13px] text-foreground">{c.campaignName ?? c.campaignId}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {c.provider === "META_ADS" ? "Meta" : c.provider === "GOOGLE_ADS" ? "Google" : c.provider}
                    {c.channel ? ` · ${c.channel}` : " · channel not stated"}
                  </span>
                </td>
                <td className="text-right text-[13px]">{formatInr(Number(c.spendMinor))}</td>
                <td className="text-right text-[13px] text-muted-foreground">{c.spendSharePct}%</td>
                <td className="text-right text-[13px] text-muted-foreground">
                  {c.cpc === null ? "—" : `₹${c.cpc.toFixed(2)}`}
                </td>
                {/* Muted, deliberately: this is the platform's number, not
                    ours, and it must not read with the same authority as the
                    spend beside it. */}
                <td className="text-right text-[13px] text-muted-foreground">
                  {c.platformRoas === null ? "—" : `${c.platformRoas.toFixed(2)}×`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.warnings.map((w) => (
        <p key={w} className="mt-2 text-[11.5px] text-muted-foreground">
          {w}
        </p>
      ))}
    </div>
  );
}
