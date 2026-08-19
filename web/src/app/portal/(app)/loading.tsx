export default function PortalLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-7 h-8 w-64 rounded bg-surface-2" />
      <div className="mb-9 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[92px] rounded-lg border border-line-strong bg-white" />
        ))}
      </div>
      <div className="grid gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[78px] rounded-lg border border-line-strong bg-white" />
        ))}
      </div>
    </div>
  );
}
