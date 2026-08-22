import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The title row every admin screen starts with.
 *
 * Exists to stop 46 screens each spending their own amount of vertical space
 * on the same three things. It also owns the `h1`: the layout used to carry
 * one reading "Admin console", so every screen in the console claimed the same
 * heading and none of them announced what they were.
 *
 * `back` renders above the title on the editing screens, where it replaces the
 * hand-rolled "← All posts" link each one had.
 */
export function PageHeader({
  title, back, lede, actions, className,
}: {
  title: string;
  back?: { href: string; label: string };
  /** Only where the screen is not self-evident — most are. */
  lede?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4", className)}>
      {back && (
        <Link
          href={back.href}
          className="mb-1.5 inline-block text-[12.5px] font-semibold text-brand-600 hover:underline"
        >
          ← {back.label}
        </Link>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-[21px] font-semibold tracking-[-.025em]">{title}</h1>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {lede && <p className="mt-1 max-w-[80ch] text-[13px] leading-[1.5] text-muted">{lede}</p>}
    </div>
  );
}

/**
 * The filter row above a list.
 *
 * Was a bordered card with stacked label-above-control fields, ~110px of the
 * viewport before a single row of data. Inline and unboxed, it is about half
 * that and reads as a toolbar rather than a form to fill in.
 */
export function FilterBar({ action, children }: { action: string; children: ReactNode }) {
  return (
    <form
      action={action}
      className="mb-3 flex flex-wrap items-end gap-x-2 gap-y-2 border-b border-line pb-3"
    >
      {children}
    </form>
  );
}

/** A labelled control inside FilterBar. The label is small and above, but tight. */
export function FilterField({
  label, htmlFor, children, className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="mb-0.5 block text-[11px] font-semibold text-faint">
        {label}
      </label>
      {children}
    </div>
  );
}
