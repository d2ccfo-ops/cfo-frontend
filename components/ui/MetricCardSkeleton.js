// Deliberately mirrors MetricCard's exact box model — same `gcard p-5`, same
// mt-3/mt-2/mt-3 rhythm, same mt-auto pt-5 footer — so swapping the real card
// in doesn't move anything on the page. A skeleton with different spacing is
// worse than none: it makes the whole grid jump at the moment data lands.
export default function MetricCardSkeleton() {
  return (
    <div className="gcard flex flex-col p-5" role="status" aria-busy="true">
      <span className="sr-only">Loading metric</span>
      <div className="h-3.5 w-24 animate-pulse rounded-sm bg-primary/10" />
      <div className="mt-3 h-6 w-32 animate-pulse rounded-sm bg-primary/10" />
      <div className="mt-2 h-3 w-40 animate-pulse rounded-sm bg-primary/10" />
      <div className="mt-3 h-5 w-20 animate-pulse rounded-full bg-primary/10" />
      <div className="mt-auto flex items-center justify-between gap-2 pt-5">
        <div className="h-3 w-24 animate-pulse rounded-sm bg-primary/10" />
        <div className="h-3 w-14 animate-pulse rounded-sm bg-primary/10" />
      </div>
    </div>
  );
}
