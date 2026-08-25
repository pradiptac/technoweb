import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn(
      "rounded-lg border border-line-strong bg-card p-[26px]",
      "transition-all duration-200 ease-brand",
      "hover:border-brand-300 hover:shadow-2 hover:-translate-y-0.5",
      className,
    )}>
      {children}
    </div>
  );
}

/**
 * The icon tile and the card's title, on one line.
 *
 * They used to stack, which spent a 40px tile plus 18px of margin on a
 * decoration before the reader reached the only line that says what the card
 * is. Side by side the tile reads as a marker *for* the heading, the title
 * sits directly above the summary it introduces, and every card in the grid
 * loses the same ~58px of height.
 *
 * `items-center` rather than `items-start` because a title that wraps to two
 * lines is the common case at `sm`, and a tile pinned to the first line of two
 * looks like it belongs to that line alone.
 *
 * The heading level is a prop: these cards sit under an `h1` on one page and
 * under an `h2` on another, and the outline has to stay valid in both.
 */
export function CardHead({
  icon, as: Tag = "h3", className, children,
}: {
  icon: ReactNode;
  as?: "h2" | "h3";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-3.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-brand-200 bg-brand-50 text-brand-ink [&_svg]:size-[19px]">
        {icon}
      </span>
      <Tag className={cn("min-w-0 text-[17.5px] leading-snug", className)}>{children}</Tag>
    </div>
  );
}

export function SectionHeader({
  kicker, title, lede, className,
}: { kicker?: string; title: string; lede?: string; className?: string }) {
  return (
    <div className={cn("mb-11 max-w-[64ch]", className)}>
      {kicker && (
        <span className="text-[11.5px] font-semibold uppercase tracking-[.13em] text-brand-ink">
          {kicker}
        </span>
      )}
      <h2 className="display-2 mt-3.5">{title}</h2>
      {lede && <p className="lede mt-4">{lede}</p>}
    </div>
  );
}
