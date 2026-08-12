// Placeholder rows for a `.table` while its data loads. `columns` should match
// the real table's column count so the header row doesn't reflow when the data
// arrives — the same no-layout-shift reasoning as MetricCardSkeleton.
export default function TableSkeleton({ rows = 6, columns = 5 }) {
  return (
    <tbody role="status" aria-busy="true">
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r}>
          {Array.from({ length: columns }, (_, c) => (
            <td key={c}>
              <div
                className="h-3.5 animate-pulse rounded-sm bg-primary/10"
                // First column is a name and reads longer; the rest are
                // numbers. Varying the widths slightly stops it looking like a
                // rendering bug rather than a loading state.
                style={{ width: c === 0 ? "70%" : "45%" }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}
