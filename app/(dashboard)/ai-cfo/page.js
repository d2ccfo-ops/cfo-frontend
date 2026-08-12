"use client";

import TopNav from "@/components/layout/TopNav";
import NoDataPanel from "@/components/ui/NoDataPanel";

// This page used to answer EVERY question with the same canned block —
// "Contribution margin fell 2.1pp to 33.8% in July, driven by a spike in RTO
// cost on Amazon" — with fabricated figures, fabricated drivers and a
// fabricated "Answered in 2.1s · Sources: Shopify, Amazon, Razorpay, Meta Ads".
// Typing any question swapped the heading and kept the same numbers.
//
// That is the most dangerous shape a fabricated number can take on this
// product: not a card a founder might discount, but a confident causal
// explanation of their own business, complete with recommended actions. There
// is no backend endpoint behind it at all, so the page now says so.
//
// When it IS built, the standing rule applies without exception: the model may
// only call typed backend functions that return numbers already computed by
// deterministic code. It never does arithmetic and never estimates a figure in
// prose.

const EXAMPLE_QUESTIONS = [
  "Why did contribution margin drop last month?",
  "Which channel is most profitable?",
  "What is driving the RTO rate?",
  "How much COD is sitting with couriers?",
];

export default function AICfoPage() {
  return (
    <>
      <TopNav title="AI CFO" subtitle="Ask anything about your numbers — answers cite their sources" />

      <div className="flex flex-col gap-5" style={{ maxWidth: 820 }}>
        <NoDataPanel
          title="Not built yet"
          reason="There is no question-answering backend behind this page. Rather than return a plausible-looking answer about your business, it returns nothing — a confident explanation of numbers nobody computed is the single most misleading thing this product could show."
        />

        <div className="gcard p-5">
          <div className="mb-2.5 text-base font-medium text-foreground">What it will answer</div>
          <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
            These are examples of the shape of question this will take, not questions it can answer today. Every
            answer will be assembled from figures the deterministic calculation engine has already computed — the
            model will never do the arithmetic itself, and every figure will link to the records behind it.
          </p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-[13px] text-muted-foreground">
            {EXAMPLE_QUESTIONS.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>

        <div className="gcard p-5">
          <div className="mb-2.5 text-base font-medium text-foreground">Where to get these answers today</div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Margin and per-SKU contribution are on the Profitability page, the revenue bridge is on Revenue, COD
            held by couriers is on Settlements and Reconciliation, and anything currently anomalous is on
            Exceptions — all computed live, all traceable to source records.
          </p>
        </div>
      </div>
    </>
  );
}
