import type { ReactNode } from "react";
import { IconTile } from "@/components/ui/icon-tile";

// Lives in its own module so a client error boundary can import it without
// this file's `IconTile` — and with it the whole icon map — coming along.
export { ErrorState } from "@/components/ui/error-state";

export function EmptyState({
  icon, title, children, action,
}: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface px-5 py-10 text-center">
      {icon && (
        <IconTile size="lg" className="mx-auto mb-3.5">{icon}</IconTile>
      )}
      <h2 className="text-base">{title}</h2>
      {children && (
        <p className="mx-auto mt-1.5 max-w-[56ch] text-13-5 text-muted">{children}</p>
      )}
      {action && <div className="mt-4.5 flex justify-center">{action}</div>}
    </div>
  );
}

