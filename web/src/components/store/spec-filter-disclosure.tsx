"use client";

import { useId, useState, type ReactNode } from "react";
import { IconChevronDown } from "@/components/icons-ui";
import { cn } from "@/lib/utils";

/**
 * The specification filter's container: a sidebar from `lg`, a disclosure
 * above the grid below it.
 *
 * Not a `<details>`: a closed one hides its content through the UA's own
 * `::details-content`, which a breakpoint cannot open again — and the panel
 * has to be simply *there* at `lg`. So the toggle is a button with
 * `aria-expanded`, drawn below `lg` only, and the panel is `hidden` until it
 * is pressed there and always shown from `lg` (the `hidden` class, never the
 * attribute: Tailwind's preflight makes `[hidden]` `display: none
 * !important`, which a breakpoint cannot win back).
 */
export function SpecFilterDisclosure({
  selected, children, className,
}: {
  /** How many values are ticked, said on the toggle so a closed panel is not a secret. */
  selected: number;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-line-strong bg-card px-4 text-14 font-semibold text-ink lg:hidden"
      >
        <span>
          Filter{selected > 0 && <span className="ml-1.5 font-normal text-muted">({selected} chosen)</span>}
        </span>
        <IconChevronDown
          aria-hidden
          className={cn("size-4 transition-[rotate] duration-(--duration-base) ease-brand", open && "rotate-180")}
        />
      </button>

      <div id={id} className={cn(open ? "mt-3 block" : "hidden", "lg:mt-0 lg:block")}>
        {children}
      </div>
    </div>
  );
}
