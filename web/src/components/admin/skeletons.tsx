import { cn } from "@/lib/utils";

/**
 * The console's skeletons, in the shapes the real screens draw (2026-10-05).
 *
 * One generic table skeleton used to stand in for every screen, so a
 * dashboard of tiles and charts, a nine-field form and a ticket thread all
 * began life as six table rows and then jumped into a different layout. A
 * skeleton is only worth drawing if the content replaces it without moving,
 * so each of these is the outline of one kind of screen: the same grid, the
 * same card radii, the same heights.
 *
 * `animate-pulse` is opacity only, and Tailwind's own utility is switched off
 * by the global reduced-motion rule, so under that preference the shapes
 * simply sit still.
 */
export function Bone({ className }: { className?: string }) {
  // `max-w-full`: a bone's width is a guess at the content's, and three tile
  // groups share one row of a phone — a 96px bone in a 21px tile ran the
  // dashboard 41px past a 414px screen for as long as it was loading.
  return <span aria-hidden className={cn("block max-w-full rounded bg-surface-2", className)} />;
}

function Panel({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("rounded-lg border border-line-strong bg-card p-4", className)}>{children}</div>;
}

/** A screen that is loading, announced once. */
function Loading({ children, label = "Loading…" }: { children: React.ReactNode; label?: string }) {
  return (
    <div role="status" className="animate-pulse">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Tile groups, the KPI row, the volume chart beside two bar lists, the heatmap. */
export function DashboardSkeleton() {
  return (
    <Loading label="Loading the dashboard…">
      <div className="flex flex-wrap gap-3">
        {[3, 3, 2].map((n, g) => (
          <Panel key={g} className="min-w-0 flex-1 p-3" >
            <Bone className="mb-3 h-3 w-20" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: n }).map((_, i) => (
                <div key={i} className="rounded-lg border border-line px-3 py-2.5">
                  <Bone className="h-5 w-10" />
                  <Bone className="mt-2 h-3 w-24" />
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>

      <Bone className="mt-8 mb-3 h-4 w-32" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Panel key={i}>
            <Bone className="h-6 w-16" />
            <Bone className="mt-2 h-3 w-28" />
            <Bone className="mt-3 h-7 w-full" />
          </Panel>
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Panel>
          <Bone className="h-4 w-28" />
          <Bone className="mt-2 h-3 w-40" />
          <div className="mt-5 flex h-48 items-end gap-1.5">
            {[40, 55, 35, 70, 60, 80, 50, 65, 45, 75, 58, 68].map((h, i) => (
              <span key={i} aria-hidden className="block flex-1 rounded-t bg-surface-2" style={{ height: `${h}%` }} />
            ))}
          </div>
        </Panel>
        <div className="grid gap-3">
          {[0, 1].map((i) => (
            <Panel key={i}>
              <Bone className="mb-3 h-4 w-28" />
              {[80, 55, 30].map((w) => (
                <div key={w} className="mb-2 flex items-center gap-2.5">
                  <Bone className="h-3 w-16" />
                  <Bone className="h-2.5 flex-1 rounded-full" />
                </div>
              ))}
            </Panel>
          ))}
        </div>
      </div>
    </Loading>
  );
}

/** A heading, a tab strip and a column of fields: every entity form. */
export function FormSkeleton() {
  return (
    <Loading>
      <Bone className="mb-2 h-3 w-24" />
      <Bone className="mb-6 h-7 w-64" />
      <div className="mb-4 flex gap-2">
        {["w-22", "w-18", "w-20", "w-14"].map((w) => <Bone key={w} className={cn("h-9 rounded-md", w)} />)}
      </div>
      <Panel className="grid gap-5 p-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i}>
            <Bone className="mb-2 h-3 w-28" />
            <Bone className={cn("rounded-md", i === 3 ? "h-32" : "h-11")} />
          </div>
        ))}
      </Panel>
    </Loading>
  );
}

/** A record's header and badges, a main column and a sidebar of facts. */
export function DetailSkeleton() {
  return (
    <Loading>
      <Bone className="mb-2 h-3 w-28" />
      <Bone className="mb-3 h-7 w-80 max-w-full" />
      <div className="mb-6 flex gap-2">
        <Bone className="h-6 w-20 rounded-full" />
        <Bone className="h-6 w-16 rounded-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid content-start gap-3">
          {[0, 1, 2].map((i) => (
            <Panel key={i}>
              <Bone className="h-3 w-32" />
              <Bone className="mt-3 h-3 w-full" />
              <Bone className="mt-2 h-3 w-5/6" />
              <Bone className="mt-2 h-3 w-2/3" />
            </Panel>
          ))}
        </div>
        <Panel className="grid content-start gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex justify-between gap-3">
              <Bone className="h-3 w-20" />
              <Bone className="h-3 w-24" />
            </div>
          ))}
        </Panel>
      </div>
    </Loading>
  );
}
