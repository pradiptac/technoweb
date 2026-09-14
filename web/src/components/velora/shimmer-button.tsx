/**
 * Velora `shimmer-button` — https://velora.colorlib.com/r/shimmer-button.json,
 * installed 2026-09-14 (Velora by Colorlib). As published, plus `ShimmerLink`
 * — the same classes on a `next/link`, because the header's "Request a
 * consultation" is a navigation, not a form control, and a `<button>` that
 * pushes a route is a link a keyboard cannot open in a new tab. shadcn's
 * tokens are mapped to this theme's. The `animate-shimmer` utility and its
 * keyframe live in `globals.css` (`--animate-shimmer` in `@theme`).
 *
 * It deliberately does **not** carry the `.btn` class, so none of the
 * `[data-motion-buttons]` families (lift, glow, shine, ripple) reach it: the
 * sweep is its only effect, which is what was asked for.
 */
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

const classes =
  "group relative inline-flex h-12 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full bg-brand-600 px-8 text-sm font-medium text-brand-on shadow-lg shadow-brand-600/30 transition-[scale,box-shadow] duration-300 hover:scale-[1.03] hover:shadow-xl hover:shadow-brand-600/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100";

function Shimmer({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="relative z-10 inline-flex items-center gap-2">
        {children}
      </span>
      <span
        aria-hidden
        className="animate-shimmer absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.35)_50%,transparent_70%)] bg-[length:250%_100%]"
      />
    </>
  );
}

interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function ShimmerButton({ className, children, ...props }: ShimmerButtonProps) {
  return (
    <button data-slot="shimmer-button" className={cn(classes, className)} {...props}>
      <Shimmer>{children}</Shimmer>
    </button>
  );
}

export function ShimmerLink({ className, children, ...props }: ComponentProps<typeof Link> & { children: ReactNode }) {
  return (
    <Link data-slot="shimmer-button" className={cn(classes, className)} {...props}>
      <Shimmer>{children}</Shimmer>
    </Link>
  );
}
