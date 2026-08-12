import { Icon, EMPTY_CIRCLE_PATHS } from "@/components/icons";

export default function EmptyState({ title = "Nothing here yet", description = "", actionLabel = "", onAction }) {
  return (
    <div className="flex flex-col items-center gap-1 px-5 py-8 text-center">
      <div className="mb-1 flex items-center justify-center rounded-full bg-primary-soft" style={{ width: 52, height: 52 }}>
        <Icon paths={EMPTY_CIRCLE_PATHS} size={26} stroke="var(--color-primary)" />
      </div>
      <div className="text-base font-medium text-foreground">{title}</div>
      <p className="mt-1 max-w-[360px] text-[13.5px] text-muted-foreground">{description}</p>
      {actionLabel ? (
        <button className="btn btn-primary mt-3.5" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
