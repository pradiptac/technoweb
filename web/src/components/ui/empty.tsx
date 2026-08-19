import type { ReactNode } from "react";

export function EmptyState({
  icon, title, children, action,
}: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface px-5 py-10 text-center">
      {icon && (
        <div className="mx-auto mb-3.5 grid size-11 place-items-center rounded-xl border border-brand-200 bg-brand-50 text-brand-600 [&_svg]:size-5">
          {icon}
        </div>
      )}
      <h2 className="text-base">{title}</h2>
      {children && (
        <p className="mx-auto mt-1.5 max-w-[38ch] text-[13.5px] text-muted">{children}</p>
      )}
      {action && <div className="mt-4.5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-[#f0d5d5] bg-err-soft px-5 py-6">
      <h2 className="text-base text-[#6d2020]">{title}</h2>
      {children && <p className="mt-1.5 text-[13.5px] text-[#6d2020]/85">{children}</p>}
    </div>
  );
}
