import { Children, cloneElement, isValidElement } from "react";
import { cn } from "@/lib/utils";
import type { ComponentProps, ReactElement, ReactNode } from "react";

const field =
  "w-full rounded border border-line-strong bg-card px-[13px] py-[11px] text-[15px] text-ink " +
  "transition-all duration-200 ease-brand placeholder:text-faint " +
  "focus:outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-100 " +
  "aria-[invalid=true]:border-err aria-[invalid=true]:ring-3 aria-[invalid=true]:ring-err-soft";

export function Field({
  label, htmlFor, hint, error, note, children, variant = "float",
}: {
  label: string; htmlFor: string; error?: string; children: ReactNode;
  /**
   * Static guidance under the control. A node rather than a string because a
   * couple of hints count what has been typed as it is typed — being pointed
   * at by `aria-describedby` and *not* being a live region is exactly right
   * for a character counter: read on focus, silent on every keystroke.
   */
  hint?: ReactNode;
  /**
   * A message that appears in response to something the user just did —
   * "Caps Lock is on". It sits where the hint sits but carries `role="status"`,
   * because a line that materialises silently is a line a screen-reader user
   * never learns about. A hint is static and needs no announcement; an error
   * arrives with a form response, which moves focus anyway.
   */
  note?: string;
  /** "float": animated label, the default. "float-static": for Select. "above": today's classic label-above-field layout, for file inputs. */
  variant?: "float" | "float-static" | "above";
}) {
  const errorId = error ? `${htmlFor}-error` : undefined;
  const hintId = !error && hint ? `${htmlFor}-hint` : undefined;
  const described = describe(children, errorId ?? hintId);

  if (variant === "above") {
    return (
      <div className="mb-[18px]">
        <label htmlFor={htmlFor} className="mb-[7px] block text-[13.5px] font-semibold">
          {label}
        </label>
        {described}
        {error
          ? <p id={errorId} className="mt-1.5 text-[12.5px] text-err">{error}</p>
          : hint && <p id={hintId} className="mt-1.5 text-[12.5px] text-faint">{hint}</p>}
        <FieldNote note={note} />
      </div>
    );
  }

  return (
    <div className="mb-[18px]">
      {/*
        The positioning context is this inner div, which holds the control and
        its label and nothing else.

        It used to be the outer wrapper — which also contains the hint and
        error paragraphs below. `top-1/2` then centred the resting label on
        *control plus helper text*, so every line of hint pushed the label
        further down: a 46px control in a 90px wrapper put the label 34px
        down, straddling its own bottom border. Fields without helper text
        looked fine, which is why it survived — and nearly every field in the
        admin CMS forms has helper text.
      */}
      <div className="relative">
        {described}
        <label
          htmlFor={htmlFor}
          className={cn(
            "pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 origin-left",
            "text-[15px] font-normal text-faint transition-all duration-200 ease-brand",
            // Floated end-state: small, straddling the top border, with a
            // bg-card cutout so the border line doesn't cut through the text.
            variant === "float-static" && "top-0 -translate-y-1/2 scale-[.82] bg-card px-1 text-muted",
            variant === "float" && [
              // All three triggers push to the identical floated values above,
              // so it doesn't matter which one "wins" when several are true at
              // once (focused AND filled) — there's nothing to conflict.
              "peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:scale-[.82] peer-focus:bg-card peer-focus:px-1 peer-focus:text-muted",
              "peer-[&:not(:placeholder-shown)]:top-0 peer-[&:not(:placeholder-shown)]:-translate-y-1/2 peer-[&:not(:placeholder-shown)]:scale-[.82] peer-[&:not(:placeholder-shown)]:bg-card peer-[&:not(:placeholder-shown)]:px-1 peer-[&:not(:placeholder-shown)]:text-muted",
              // Visible placeholder text: stay floated even while empty, or the
              // label and the placeholder render on top of each other.
              "peer-data-[has-placeholder]:top-0 peer-data-[has-placeholder]:-translate-y-1/2 peer-data-[has-placeholder]:scale-[.82] peer-data-[has-placeholder]:bg-card peer-data-[has-placeholder]:px-1 peer-data-[has-placeholder]:text-muted",
            ],
          )}
        >
          {label}
        </label>
      </div>
      {error
        ? <p id={errorId} className="mt-1.5 text-[12.5px] text-err">{error}</p>
        : hint && <p id={hintId} className="mt-1.5 text-[12.5px] text-faint">{hint}</p>}
      <FieldNote note={note} />
    </div>
  );
}

/**
 * Point the control at the paragraph describing it.
 *
 * `Field` built both ids and rendered both paragraphs and then wired nothing
 * to either, so every hint and every validation message in this product was
 * visible text a screen reader had no way to associate with the field it
 * belonged to — the error especially, which is the one sentence saying why a
 * save failed.
 *
 * It clones the **first element child**, not the only one: `PasswordField`
 * passes an `<Input>` and its reveal `<button>`, so a single-child check
 * skipped exactly the field that most needs its hint read out. Every caller
 * puts the control first.
 *
 * A child's own `aria-describedby` wins, so a caller pointing at something
 * more specific is not silently overwritten.
 */
function describe(children: ReactNode, id?: string): ReactNode {
  if (!id) {
    return children;
  }

  let done = false;

  return Children.map(children, (child) => {
    if (done || !isValidElement(child)) {
      return child;
    }
    done = true;

    const props = child.props as { "aria-describedby"?: string };

    return props["aria-describedby"]
      ? child
      : cloneElement(child as ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": id });
  });
}

/**
 * Rendered — empty — as soon as a caller passes `note` at all, and not at all
 * when it is left undefined.
 *
 * A live region has to exist in the DOM *before* its text arrives. A container
 * mounted with the message already inside it is not an update, so assistive
 * technology has nothing to compare against and announces nothing. Passing
 * `note=""` is therefore how a field arms the region ahead of time; leaving it
 * out keeps an empty paragraph off the several hundred fields that have
 * nothing to say.
 */
function FieldNote({ note }: { note?: string }) {
  if (note === undefined) return null;

  return (
    <p role="status" className={cn("text-[12.5px] text-warn", note && "mt-1.5")}>
      {note}
    </p>
  );
}

/**
 * The blank placeholder is what :placeholder-shown keys off — that selector
 * needs a placeholder present to report emptiness at all.
 *
 * A caller-supplied placeholder is different: it is visible text, and it
 * occupies exactly the spot a resting label sits in. data-has-placeholder
 * marks that case so Field can float the label permanently and let the two
 * sit above each other instead of on top of each other.
 */
function placeholderProps(placeholder: string | number | readonly string[] | undefined) {
  const real = typeof placeholder === "string" && placeholder.trim() !== "";

  return {
    placeholder: real ? placeholder : " ",
    ...(real ? { "data-has-placeholder": "" } : {}),
  };
}

export function Input({ className, placeholder, ...props }: ComponentProps<"input">) {
  return <input {...placeholderProps(placeholder)} className={cn(field, "peer", className)} {...props} />;
}

export function Textarea({ className, placeholder, ...props }: ComponentProps<"textarea">) {
  return <textarea {...placeholderProps(placeholder)} className={cn(field, "peer", className)} {...props} />;
}

/**
 * A file input whose button belongs to this console.
 *
 * The native ::file-selector-button is styled rather than replaced by a label
 * dressed as a button: the real input keeps its own focus ring, its keyboard
 * behaviour and its accessible name, and there is no hidden control to keep
 * in sync. Six places rendered a bare one — the Settings General tab showed
 * three unstyled "Choose file  No file chosen" strings in a row.
 */
export function FileInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="file"
      className={cn(
        "w-full cursor-pointer rounded border border-line-strong bg-card text-[13px] text-muted",
        "transition-all duration-200 ease-brand",
        "file:mr-3 file:cursor-pointer file:rounded-l file:border-0 file:border-r file:border-line",
        "file:bg-surface-2 file:px-3.5 file:py-[9px] file:text-[13px] file:font-semibold file:text-ink",
        "hover:file:bg-line",
        "focus:border-brand-400 focus:ring-3 focus:ring-brand-100 focus:outline-none",
        "aria-[invalid=true]:border-err aria-[invalid=true]:ring-3 aria-[invalid=true]:ring-err-soft",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        field,
        // Every space here is %20 deliberately. A literal space ends a Tailwind
        // class name, and this url once contained seven of them — so the class
        // was shredded into nine junk fragments, no background-image was
        // generated, and every select in the console reserved 36px for a
        // chevron that never drew and looked exactly like a text input.
        // Tailwind's usual _ escape is wrong here too: it is not unescaped
        // inside url(), so the SVG became <svg_xmlns=… and failed to parse.
        "appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2024%2024%22%20fill=%22none%22%20stroke=%22%236b6d61%22%20stroke-width=%222.4%22%20stroke-linecap=%22round%22%3E%3Cpath%20d=%22m6%209.4%206%205.6%206-5.6%22/%3E%3C/svg%3E')] bg-[length:14px] bg-[position:right_12px_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    />
  );
}

/*
 * `Alert` moved to ./alert.tsx and is re-exported here.
 *
 * Closing one needs state, and `"use client"` at the top of this file would
 * pull every form control in the console over the client boundary with it.
 * Re-exporting keeps the import path every call site already uses — the
 * boundary is at alert.tsx and nothing else had to move.
 */
export { Alert } from "./alert";
