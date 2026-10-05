import type { ReactNode } from "react";
import { IconTile } from "@/components/ui/icon-tile";
import { Illustration, type IllustrationName } from "@/components/ui/illustrations";

// Lives in its own module so a client error boundary can import it without
// this file's `IconTile` — and with it the whole icon map — coming along.
export { ErrorState } from "@/components/ui/error-state";

/**
 * An empty list, said kindly (2026-10-05): a spot illustration, the heading,
 * a sentence and the one action that fills it.
 *
 * `illustration` picks the scene (`components/ui/illustrations.tsx`); with
 * neither it nor an `icon` the box draws `empty`, so every one of the ~75
 * screens already using this gained a picture without a call site changing.
 * An `icon` still wins where a screen asked for one — it is a deliberate
 * identity mark, and the illustration is the default rather than a rule.
 * The ground is the surface, not a dashed border: a dashed box reads as a
 * drop zone, which is the one thing an empty list usually is not.
 */
export function EmptyState({
  icon, illustration, title, children, action, compact = false,
}: {
  icon?: ReactNode;
  illustration?: IllustrationName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** A panel inside a card: less padding, a smaller scene. */
  compact?: boolean;
}) {
  return (
    <div className={compact ? "px-4 py-6 text-center" : "rounded-lg border border-line-strong bg-surface px-5 py-10 text-center"}>
      {icon ? (
        <IconTile size="lg" className="mx-auto mb-3.5">{icon}</IconTile>
      ) : (
        <Illustration name={illustration ?? "empty"} className={compact ? "mx-auto mb-2 h-16 w-20" : "mx-auto mb-3"} />
      )}
      {/* Inside a card the card's own heading is the section's; the empty
          state's line is a sentence under it, not a second heading. */}
      {compact ? <p className="text-14 font-semibold text-ink">{title}</p> : <h2 className="text-base">{title}</h2>}
      {children && (
        <p className="mx-auto mt-1.5 max-w-[56ch] text-13-5 text-muted">{children}</p>
      )}
      {action && <div className="mt-4.5 flex justify-center">{action}</div>}
    </div>
  );
}
