export default function LoadingSkeleton({ rows = 4 }) {
  const lines = Array.from({ length: rows }, (_, i) => i);
  return (
    <div className="flex flex-col gap-2.5 py-3">
      {lines.map((i) => (
        <div
          key={i}
          className="h-3.5 animate-pulse rounded bg-muted"
          style={{ width: i === rows - 1 ? "55%" : "100%" }}
        />
      ))}
    </div>
  );
}
