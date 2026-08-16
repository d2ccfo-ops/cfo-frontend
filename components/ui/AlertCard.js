import Link from "next/link";
import StatusBadge from "./StatusBadge";

const SEV = {
  critical: { dot: "bg-destructive", tone: "negative", label: "Critical" },
  warning: { dot: "bg-accent", tone: "warning", label: "Warning" },
  info: { dot: "bg-primary", tone: "info", label: "Info" },
};

export default function AlertCard({
  severity = "info",
  title = "Alert",
  description = "",
  meta = "",
  actionLabel = "Investigate",
  actionHref,
  onAction,
}) {
  const sev = SEV[severity] ? severity : "info";
  const s = SEV[sev];
  // A button with no handler and no destination is a control that lies about
  // being interactive — the action is rendered only when it actually goes
  // somewhere or does something.
  const hasAction = Boolean(actionHref || onAction);
  const actionClass =
    "alert-card__action inline-flex h-8 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium text-primary transition-colors";

  // min-w-0 on the CARD, not just on the column inside it. The inner column
  // already had it, which is why this looked handled — but the card is itself
  // an item of the grid on the overview, so it kept min-width: auto and sized
  // to its own min-content instead of its track. Measured at 320px: 299px of
  // card in a 272px parent, which pushed the whole document sideways. The
  // offending content is an anomaly title carrying an unbreakable connection
  // id, "GOKWIK (19slhb8ckcwi)".
  return (
    <div className="gcard flex min-w-0 gap-3 p-5">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          {/* Wraps rather than widening the card. `break-words` is what lets
              that connection id break mid-token — without it the title has a
              min-content width no amount of min-w-0 can get under. */}
          <div className="min-w-0 break-words text-[15px] font-medium text-foreground">{title}</div>
          <StatusBadge status={s.tone} label={s.label} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{meta}</span>
          {actionHref ? (
            <Link className={actionClass} href={actionHref}>{actionLabel}</Link>
          ) : hasAction ? (
            <button className={actionClass} onClick={onAction} type="button">{actionLabel}</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
