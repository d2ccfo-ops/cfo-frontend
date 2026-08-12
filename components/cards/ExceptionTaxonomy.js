"use client";

import { useState } from "react";
import { formatInr } from "@/lib/money";

// P6.4 — the §15 reconciliation exception taxonomy.
//
// WHY THIS IS SEPARATE FROM THE ALERTS ABOVE IT. An anomaly is a metric that
// moved: RTO up 4 points, ad spend up 30%. An exception is money whose
// whereabouts do not add up. They read similarly and mean entirely different
// things — one is a trend to understand, the other is a specific rupee amount
// somebody has to go and find.
//
// WHY "NOT DETECTABLE" GETS ITS OWN TREATMENT. An organisation that has never
// uploaded a COD remittance statement cannot distinguish "no missing
// remittances" from "we cannot see remittances". Rendering both as a grey zero
// would tell a founder their COD is fully collected when the truth is that
// nobody has looked. So an undetectable type renders in the accent colour with
// the reason spelled out, and is excluded from the total — never folded into a
// count that looks complete.

const SEVERITY_STYLE = {
  critical: { color: "var(--color-destructive)", background: "var(--color-destructive-soft)" },
  warning: { color: "var(--color-accent)", background: "var(--color-accent-soft)" },
  info: { color: "var(--color-primary)", background: "var(--color-primary-soft)" },
};

function Row({ type }) {
  const [open, setOpen] = useState(false);
  const tone = SEVERITY_STYLE[type.severity] ?? SEVERITY_STYLE.info;
  const hasRows = type.detectable && type.count > 0;

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-3 border-none bg-transparent px-0 py-3 text-left"
        onClick={() => (hasRows ? setOpen((v) => !v) : null)}
        aria-expanded={hasRows ? open : undefined}
      >
        <span
          className="rounded px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide"
          style={{ color: tone.color, background: tone.background }}
        >
          {type.severity}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-foreground">{type.label}</span>
          <span className="block text-[11.5px] text-muted-foreground">{type.meaning}</span>
        </span>

        <span className="shrink-0 text-right">
          {type.detectable ? (
            <>
              <span className="block text-[13px] text-foreground">
                {type.count.toLocaleString("en-IN")}
              </span>
              <span className="block text-[11.5px] text-muted-foreground">
                {formatInr(Number(type.valueMinor))}
              </span>
            </>
          ) : (
            // Never a zero. A zero here would read as "all clear".
            <span className="block text-[12px]" style={{ color: "var(--color-accent)" }}>
              can&apos;t be checked
            </span>
          )}
        </span>
      </button>

      {!type.detectable ? (
        <p className="pb-3 text-[11.5px]" style={{ color: "var(--color-accent)" }}>
          {type.reason}
        </p>
      ) : null}

      {open && hasRows ? (
        <div className="pb-3">
          <p className="mb-2 text-[11.5px] text-muted-foreground">{type.reason}</p>
          <div className="flex flex-col gap-1">
            {type.sample.map((s) => (
              <div key={s.id} className="flex items-baseline justify-between gap-3 rounded-md bg-muted px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{s.reference}</span>
                <span className="text-[11.5px] text-muted-foreground">{s.detail}</span>
                <span className="shrink-0 text-[12px] text-foreground">{formatInr(Number(s.amountMinor))}</span>
              </div>
            ))}
          </div>
          {type.count > type.sample.length ? (
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              Showing {type.sample.length} of {type.count.toLocaleString("en-IN")} — the largest by value.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function ExceptionTaxonomy({ report, loading }) {
  if (loading) {
    return (
      <div className="gcard p-5" role="status" aria-busy="true">
        <span className="sr-only">Loading reconciliation exceptions</span>
        <div className="mb-4 h-4 w-1/3 animate-pulse rounded-sm bg-primary/10" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="mb-2 h-8 animate-pulse rounded-sm bg-primary/10" />
        ))}
      </div>
    );
  }

  if (!report) return null;

  const undetectableCount = report.types.filter((t) => !t.detectable).length;

  return (
    <div className="gcard p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-medium text-foreground">Reconciliation exceptions</h3>
        <span className="text-[13px] text-foreground">
          {report.totalCount.toLocaleString("en-IN")} · {formatInr(Number(report.totalValueMinor))}
        </span>
      </div>
      <p className="mb-3 text-[12px] text-muted-foreground">
        Money whose whereabouts do not add up, by kind. Different from the alerts above: an alert is a metric that
        moved, an exception is a specific amount somebody has to go and find.
        {undetectableCount > 0 ? (
          <>
            {" "}
            <span style={{ color: "var(--color-accent)" }}>
              {undetectableCount} of 11 cannot be checked at all — those are excluded from the total above, not counted
              as zero.
            </span>
          </>
        ) : null}
      </p>

      <div className="flex flex-col">
        {report.types.map((t) => (
          <Row key={t.key} type={t} />
        ))}
      </div>
    </div>
  );
}
