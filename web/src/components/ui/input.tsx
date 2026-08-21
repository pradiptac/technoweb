import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

const field =
  "w-full rounded border border-line-strong bg-white px-[13px] py-[11px] text-[15px] text-ink " +
  "transition-all duration-200 ease-brand placeholder:text-faint " +
  "focus:outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-100 " +
  "aria-[invalid=true]:border-err aria-[invalid=true]:ring-3 aria-[invalid=true]:ring-err-soft";

export function Field({
  label, htmlFor, hint, error, children, variant = "float",
}: {
  label: string; htmlFor: string; hint?: string; error?: string; children: ReactNode;
  /** "float": animated label, the default. "float-static": for Select. "above": today's classic label-above-field layout, for file inputs. */
  variant?: "float" | "float-static" | "above";
}) {
  const errorId = error ? `${htmlFor}-error` : undefined;
  const hintId = !error && hint ? `${htmlFor}-hint` : undefined;

  if (variant === "above") {
    return (
      <div className="mb-[18px]">
        <label htmlFor={htmlFor} className="mb-[7px] block text-[13.5px] font-semibold">
          {label}
        </label>
        {children}
        {error
          ? <p id={errorId} className="mt-1.5 text-[12.5px] text-err">{error}</p>
          : hint && <p id={hintId} className="mt-1.5 text-[12.5px] text-faint">{hint}</p>}
      </div>
    );
  }

  return (
    <div className="relative mb-[18px]">
      {children}
      <label
        htmlFor={htmlFor}
        className={cn(
          "pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 origin-left",
          "text-[15px] font-normal text-faint transition-all duration-200 ease-brand",
          // Floated end-state: small, straddling the top border, with a
          // bg-white cutout so the border line doesn't cut through the text.
          variant === "float-static" && "top-0 -translate-y-1/2 scale-[.82] bg-white px-1 text-muted",
          variant === "float" && [
            // Both triggers push to the identical floated values above, so
            // it doesn't matter which one "wins" when both are true at once
            // (focused AND already filled) — there's nothing to conflict.
            "peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:scale-[.82] peer-focus:bg-white peer-focus:px-1 peer-focus:text-muted",
            "peer-[&:not(:placeholder-shown)]:top-0 peer-[&:not(:placeholder-shown)]:-translate-y-1/2 peer-[&:not(:placeholder-shown)]:scale-[.82] peer-[&:not(:placeholder-shown)]:bg-white peer-[&:not(:placeholder-shown)]:px-1 peer-[&:not(:placeholder-shown)]:text-muted",
          ],
        )}
      >
        {label}
      </label>
      {error
        ? <p id={errorId} className="mt-1.5 text-[12.5px] text-err">{error}</p>
        : hint && <p id={hintId} className="mt-1.5 text-[12.5px] text-faint">{hint}</p>}
    </div>
  );
}

export function Input({ className, placeholder, ...props }: ComponentProps<"input">) {
  return <input placeholder={placeholder ?? " "} className={cn(field, "peer", className)} {...props} />;
}

export function Textarea({ className, placeholder, ...props }: ComponentProps<"textarea">) {
  return <textarea placeholder={placeholder ?? " "} className={cn(field, "peer", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        field,
        "appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b6d61%22 stroke-width=%222.4%22 stroke-linecap=%22round%22%3E%3Cpath d=%22m6 9.4 6 5.6 6-5.6%22/%3E%3C/svg%3E')] bg-[length:14px] bg-[position:right_12px_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    />
  );
}

export function Alert({
  tone = "info", title, children,
}: { tone?: "ok" | "warn" | "err" | "info"; title: string; children?: ReactNode }) {
  const tones = {
    ok: "bg-ok-soft border-[#d3e8cf] text-[#254a1f]",
    warn: "bg-warn-soft border-[#f2e2c6] text-[#6b470f]",
    err: "bg-err-soft border-[#f0d5d5] text-[#6d2020]",
    info: "bg-info-soft border-[#d6e4ee] text-[#1e3f55]",
  } as const;
  return (
    <div role={tone === "err" ? "alert" : "status"} className={cn("mb-2.5 rounded border px-4 py-3.5 text-sm", tones[tone])}>
      <b className="mb-0.5 block font-semibold">{title}</b>
      {children}
    </div>
  );
}
