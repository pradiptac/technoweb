"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconChevronDown, IconSignOut } from "@/components/icons-ui";
import { cn } from "@/lib/utils";

/**
 * `icon` arrives already rendered from the server layout — a glyph from
 * `@/components/icons` would put the whole icon map in this client bundle.
 */
export type AccountItem = { label: string; href: string; external?: boolean; icon?: ReactNode };

const ITEM = "flex items-center gap-2.5 rounded px-3 py-2 text-13 hover:bg-surface-2";
const GLYPH = "grid size-4 shrink-0 place-items-center text-muted [&_svg]:size-4";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

/**
 * The account disc both areas carry (Console 2.0): who is signed in, a
 * detail line (roles, or the company), a few links, and Sign out as a real
 * form post. It replaced three loose controls in the bar, which at 320px had
 * already lost two of them to fit.
 *
 * A button with `aria-expanded`. Escape and a press outside close it, and
 * Escape hands focus back to the button so the keyboard is never left on a
 * control that has just vanished.
 */
export function AccountMenu({ name, detail, items, signOut }: {
  name: string;
  detail?: string | null;
  items: AccountItem[];
  signOut: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open]);

  return (
    <div ref={root} data-account-menu className="relative">
      <button
        ref={button} type="button" aria-expanded={open} aria-controls={id}
        aria-label={`Account: ${name}`}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-1 pr-1 pl-1 transition-colors duration-(--duration-base) hover:bg-surface-2 sm:pr-2"
      >
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-brand-600 text-12 font-bold text-brand-on">
          {initials(name)}
        </span>
        <span className="hidden max-w-[18ch] truncate text-13 font-medium sm:block">{name}</span>
        <IconChevronDown
          aria-hidden
          className={cn("hidden size-3.5 text-muted transition-[rotate] duration-(--duration-base) sm:block", open && "rotate-180")}
        />
      </button>
      <div
        id={id}
        className={cn(
          "popover-motion absolute top-full right-0 z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-line-strong bg-card p-2 shadow-3",
          open ? "block" : "hidden",
        )}
      >
        <div className="border-b border-line px-3 pt-1 pb-3">
          <p className="truncate text-13-5 font-semibold">{name}</p>
          {detail && <p className="truncate text-12-5 text-muted">{detail}</p>}
        </div>
        <ul className="py-1">
          {items.map((i) => (
            <li key={i.href}>
              {i.external ? (
                <a href={i.href} target="_blank" rel="noopener" className={ITEM}>
                  {i.icon && <span aria-hidden className={GLYPH}>{i.icon}</span>}
                  {i.label}<span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <Link href={i.href} onClick={() => setOpen(false)} className={ITEM}>
                  {i.icon && <span aria-hidden className={GLYPH}>{i.icon}</span>}
                  {i.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
        <form action={signOut} className="border-t border-line pt-1">
          <button type="submit" className={`${ITEM} w-full text-left font-semibold`}>
            <span aria-hidden className={GLYPH}><IconSignOut /></span> Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
