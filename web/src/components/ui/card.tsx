import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn(
      "rounded-lg border border-line-strong bg-white p-[26px]",
      "transition-all duration-200 ease-brand",
      "hover:border-brand-300 hover:shadow-2 hover:-translate-y-0.5",
      className,
    )}>
      {children}
    </div>
  );
}

export function CardIcon({ children }: { children: ReactNode }) {
  return (
    <div className="mb-[18px] grid size-10 place-items-center rounded-[10px] border border-brand-200 bg-brand-50 text-brand-600 [&_svg]:size-[19px]">
      {children}
    </div>
  );
}

export function SectionHeader({
  kicker, title, lede, className,
}: { kicker?: string; title: string; lede?: string; className?: string }) {
  return (
    <div className={cn("mb-11 max-w-[64ch]", className)}>
      {kicker && (
        <span className="text-[11.5px] font-semibold uppercase tracking-[.13em] text-brand-600">
          {kicker}
        </span>
      )}
      <h2 className="display-2 mt-3.5">{title}</h2>
      {lede && <p className="lede mt-4">{lede}</p>}
    </div>
  );
}
