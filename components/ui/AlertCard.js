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
    "alert-card__action inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-primary transition-colors";

  return (
    <div className="gcard flex gap-3 p-4">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[15px] font-medium text-foreground">{title}</div>
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
