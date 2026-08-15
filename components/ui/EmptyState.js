import { Icon, EMPTY_CIRCLE_PATHS } from "@/components/icons";

export default function EmptyState({ title = "Nothing here yet", description = "", actionLabel = "", onAction }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
      <span className="mb-1 grid h-13 w-13 place-items-center rounded-full bg-primary-soft p-3 text-primary">
        <Icon paths={EMPTY_CIRCLE_PATHS} size={24} />
      </span>
      <div className="text-base font-medium text-foreground">{title}</div>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {actionLabel ? (
        <button className="btn btn-primary mt-4" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
