import TopNav from "@/components/layout/TopNav";
import NoDataPanel from "@/components/ui/NoDataPanel";

// No report generation exists — no endpoint, no export, no scheduler. The page
// previously listed six reports each claiming "Updated 1 hour ago" with a live-
// looking Export button, and three scheduled sends to real-looking addresses
// ("ca@sharmaassociates.in", next send 1 Sep 2026). A founder would reasonably
// have believed their CA was receiving a monthly P&L. Nothing was being sent.

const PLANNED = [
  {
    kicker: "Statement",
    title: "Profit & loss",
    blockedBy: "Needs complete product costs and an accounting feed — operating costs like payroll and rent never touch Shopify.",
  },
  {
    kicker: "Statement",
    title: "Cash-flow statement",
    blockedBy: "Needs a connected bank account; only 19 bank transactions exist across all organisations today.",
  },
  {
    kicker: "Statement",
    title: "Balance sheet",
    blockedBy: "Needs an accounting system — assets, liabilities and equity have no source in this product.",
  },
  {
    kicker: "Compliance",
    title: "GST summary",
    blockedBy: "Output GST is already computed per order in the revenue ladder; input tax credit needs purchase invoices, which need an accounting feed.",
  },
  {
    kicker: "Operational",
    title: "Channel profitability",
    blockedBy: "Needs shipping, fees and ad spend allocated per channel (§41). Revenue by channel is already real on the Revenue page.",
  },
];

export default function ReportsPage() {
  return (
    <>
      <TopNav title="Reports" subtitle="Board-ready statements and exports" />

      <div className="flex flex-col gap-6">
        <NoDataPanel
          title="Report generation isn't built"
          reason="No report can be generated, exported or scheduled yet. The pages that do have real numbers — Revenue, Reconciliation, Profitability, Inventory and Product costs — are the current way to read them."
        />

        <div>
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Planned reports, and what each one is waiting on
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {PLANNED.map((r) => (
              <div key={r.title} className="card elev-sm">
                <div className="card-kicker">{r.kicker}</div>
                <div className="card-title">{r.title}</div>
                <div className="card-body">{r.blockedBy}</div>
              </div>
            ))}
          </div>
        </div>

        <NoDataPanel
          title="Scheduled reports"
          reason="Nothing is scheduled and nothing is being emailed to anyone. This page used to list three recurring sends with recipients and next-send dates; none of them existed, and no email is sent by this product today."
        />
      </div>
    </>
  );
}
