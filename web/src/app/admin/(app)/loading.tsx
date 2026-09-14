/**
 * The console's skeleton between screens: a heading bar, a filter strip and
 * six rows, in the shapes `PageHeader`, `FilterBar` and `.admin-table` draw,
 * so the real screen replaces it without a jump. The console renders on
 * every request, so this is what every sidebar click shows.
 */
export default function AdminLoading() {
  return (
    <div role="status" className="animate-pulse">
      <span className="sr-only">Loading…</span>
      <div className="mb-6 h-7 w-56 rounded bg-surface-2" />
      <div className="mb-4 h-11 rounded-lg border border-line-strong bg-card" />
      <div className="grid gap-px overflow-hidden rounded-lg border border-line-strong bg-line">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 bg-card" />
        ))}
      </div>
    </div>
  );
}
