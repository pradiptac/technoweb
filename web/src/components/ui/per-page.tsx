"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconSliders } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * How many rows a list shows, chosen by the person reading it.
 *
 * The value lives in the URL rather than in state or a cookie: a filtered,
 * sized view of a list is something people bookmark and send each other, and
 * it has to survive the reload every save and delete performs.
 *
 * 10/25/50/100 and no more. Every admin index caps per_page at 100, so a
 * "200 per page" option would hand back 100 rows under a label claiming 200 —
 * the one thing a control like this must never do is misreport what it did.
 */
const OPTIONS = [10, 25, 50, 100] as const;

export function PerPage({
  current, basePath, params,
}: {
  current: number;
  basePath: string;
  /** Everything else on the query string, so choosing a size keeps the filters. */
  params: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const close = (e: Event) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) wrapRef.current?.querySelector<HTMLElement>('[role="menuitemradio"]')?.focus();
  }, [open]);

  const choose = (size: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v && k !== "page" && k !== "per_page") q.set(k, v);
    }
    q.set("per_page", String(size));
    // Back to the first page. Page 7 of 25-per-page is not page 7 of 100, and
    // landing on an empty page after resizing looks like the list broke.
    setOpen(false);
    router.push(`${basePath}?${q.toString()}`);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-1.5 rounded border border-line-strong bg-card px-2.5 py-1.5 text-[12.5px] text-muted hover:border-faint hover:text-ink [&_svg]:size-3.5"
      >
        <IconSliders />
        {current} per page
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Rows per page"
          className="absolute bottom-full left-0 z-40 mb-1.5 w-44 rounded-lg border border-line-strong bg-card py-1.5 shadow-3"
        >
          {OPTIONS.map((size) => {
            const selected = size === current;
            return (
              <button
                key={size}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => choose(size)}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2 text-left text-[13px]",
                  selected ? "bg-surface-2 font-semibold text-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                {size} per page
                {selected && <IconCheck className="size-3.5 text-brand-ink" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
