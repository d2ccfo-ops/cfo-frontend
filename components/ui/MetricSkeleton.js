// Mirrors components/ui/Metric's box model exactly — same `gcard p-5`, same
// mt-1/mt-2/mt-2 rhythm — so the real value swaps in without the grid jumping.
// This said p-4 while Metric has always rendered p-5, so every card it stood in
// for jumped 4px on each edge the instant its number landed — the exact shift
// the skeleton exists to absorb.
// (MetricCardSkeleton is the equivalent for the larger MetricCard on the
// Overview page; the two components have different padding, so they need
// different skeletons.)
export default function MetricSkeleton() {
  return (
    <div className="gcard p-5" role="status" aria-busy="true">
      <span className="sr-only">Loading metric</span>
      <div className="h-3 w-24 animate-pulse rounded-sm bg-primary/10" />
      <div className="mt-1 h-8 w-28 animate-pulse rounded-sm bg-primary/10" />
      <div className="mt-2 h-5 w-20 animate-pulse rounded-full bg-primary/10" />
      <div className="mt-2 h-3 w-32 animate-pulse rounded-sm bg-primary/10" />
    </div>
  );
}
