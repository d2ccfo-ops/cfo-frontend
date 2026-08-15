import { Icon, ERROR_TRIANGLE_PATHS } from "@/components/icons";

export default function ErrorState({
  title = "Couldn't load this data",
  description = "The last sync failed. Try again, or check the connection status page.",
  onRetry,
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
      <span className="mb-1 grid h-13 w-13 place-items-center rounded-full bg-destructive-soft p-3 text-destructive">
        <Icon paths={ERROR_TRIANGLE_PATHS} size={24} />
      </span>
      <div className="text-base font-medium text-foreground">{title}</div>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      <button className="btn btn-secondary mt-4" onClick={onRetry} type="button">
        Retry
      </button>
    </div>
  );
}
