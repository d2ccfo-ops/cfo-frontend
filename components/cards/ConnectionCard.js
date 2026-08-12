import StatusBadge from "@/components/ui/StatusBadge";

const STATUS_MAP = {
  connected: { tone: "positive", label: "Connected", btnClass: "btn-secondary", defaultAction: "Manage" },
  syncing: { tone: "neutral", label: "Syncing", btnClass: "btn-secondary", defaultAction: "View" },
  error: { tone: "negative", label: "Needs attention", btnClass: "btn-secondary", defaultAction: "Fix connection" },
  not_connected: { tone: "neutral", label: "Not connected", btnClass: "btn-primary", defaultAction: "Connect" },
};

export default function ConnectionCard({ name = "Shopify", category = "Storefront", status = "connected", lastSync = "Synced 12 min ago", actionLabel, onAction, actionDisabled = false }) {
  const m = STATUS_MAP[status] || STATUS_MAP.connected;
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div className="gcard flex flex-col p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-primary-soft text-[13px] font-semibold text-primary">{initials}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium text-foreground">{name}</div>
          <div className="text-xs text-muted-foreground">{category}</div>
        </div>
        <StatusBadge status={m.tone} label={m.label} />
      </div>
      <div className="mt-3.5 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">{status === "not_connected" ? "" : lastSync}</span>
        <button className={`btn ${m.btnClass}`} onClick={onAction} disabled={actionDisabled} type="button">
          {actionLabel || m.defaultAction}
        </button>
      </div>
    </div>
  );
}
