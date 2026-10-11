import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * One surface for every dashboard panel (Console 2.0): a raised card and a
 * title row with an icon disc. The panels used to be flat cards each with
 * its own heading size, which read as a page of forms rather than a
 * dashboard.
 */
export function Panel({ title, icon, actions, children, className }: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card as="section" interactive={false} padding="sm" className={cn("rounded-xl shadow-2", className)}>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        {icon && (
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-ink [&_svg]:size-4">
            {icon}
          </span>
        )}
        <h2 className="text-14 font-semibold">{title}</h2>
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
      {children}
    </Card>
  );
}
