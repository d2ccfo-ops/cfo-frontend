"use client";

import Explain from "./Explain";

const TONE = {
  positive: "bg-success-soft text-success",
  negative: "bg-destructive-soft text-destructive",
  warning: "bg-accent-soft text-accent",
  info: "bg-primary-soft text-primary",
  neutral: "bg-muted text-muted-foreground",
};

// `term` is optional. A badge that names a DERIVED state — a reconciliation
// status is the output of a seven-branch classifier, not a field on the order —
// passes one, and becomes clickable. Decorative badges ("On track") pass
// nothing and render exactly as before, because Explain falls through to plain
// text when the term has no definition.
export default function StatusBadge({ status = "neutral", label = "Status", term }) {
  const cls = TONE[status] || TONE.neutral;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${cls}`}>
      <Explain term={term} value={label}>
        {label}
      </Explain>
    </span>
  );
}
