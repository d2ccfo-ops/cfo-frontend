"use client";

import Link from "next/link";
import Explain from "./Explain";
import { explainAttrs } from "./ExplainMode";

// The house style for "this section has nothing to show". Used instead of an
// empty chart, a zero, or — as several pages used to do — a plausible-looking
// invented figure. It always answers two questions: why is this blank, and what
// would fill it.
//
// `tone="error"` is for "we could not reach the backend", which is a different
// statement from "no source is connected" and must not be dressed up as one.
// `term` lets a not-yet-built section still explain WHAT it would be — "why is
// this blank" and "what would this have told me" are different questions, and
// the second one is the reason someone would connect the missing source.
export default function NoDataPanel({ title, reason, action, href, tone = "muted", term = null }) {
  const isError = tone === "error";
  return (
    <div className="gcard flex flex-col p-5" {...explainAttrs(term ?? title)}>
      {title ? (
        <div className="mb-2.5 text-base font-medium text-foreground">
          <Explain term={term ?? title} underline={false} className="hover:underline hover:decoration-dotted hover:underline-offset-4">
            {title}
          </Explain>
        </div>
      ) : null}
      <div className="flex flex-1 flex-col items-start justify-center gap-3 py-6">
        <p className="text-sm" style={isError ? { color: "var(--color-destructive)" } : undefined}>
          <span className={isError ? "" : "text-muted-foreground"}>{reason}</span>
        </p>
        {action && href ? (
          <Link href={href} className="text-xs font-medium text-primary hover:underline">
            {action} →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
