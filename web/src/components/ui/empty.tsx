import type { ReactNode } from "react";
import { IconTile } from "@/components/ui/icon-tile";

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
        <p className="mx-auto mt-1.5 max-w-[56ch] text-[13.5px] text-muted">{children}</p>
      )}
      {action && <div className="mt-4.5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    /*
      Tokens, not literals — the same fix `Alert` and `Badge` needed. This one
      is the worst place to have had it: it renders when a screen cannot load,
      so in dark the explanation of what went wrong was itself unreadable.
    */
    <div role="alert" className="rounded-lg border border-err/25 bg-err-soft px-5 py-6">
      <h2 className="text-base text-err">{title}</h2>
      {children && <p className="mt-1.5 text-[13.5px] text-err/85">{children}</p>}
    </div>
  );
}
