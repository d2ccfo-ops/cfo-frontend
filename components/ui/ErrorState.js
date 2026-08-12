import { Icon, ERROR_TRIANGLE_PATHS } from "@/components/icons";

export default function ErrorState({
  title = "Couldn't load this data",
  description = "The last sync failed. Try again, or check the connection status page.",
  onRetry,
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-5 py-8 text-center">
      <div className="mb-1 flex items-center justify-center rounded-full bg-destructive-soft" style={{ width: 52, height: 52 }}>
        <Icon paths={ERROR_TRIANGLE_PATHS} size={26} stroke="var(--color-destructive)" />
      </div>
      <div className="text-base font-medium text-foreground">{title}</div>
      <p className="mt-1 max-w-[360px] text-[13.5px] text-muted-foreground">{description}</p>
      <button className="btn btn-secondary mt-3.5" onClick={onRetry} type="button">
        Retry
      </button>
    </div>
  );
}
