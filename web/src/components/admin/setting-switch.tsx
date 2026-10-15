"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { Switch } from "@/components/ui/switch";

/**
 * A boolean setting as a small sliding switch (0.135.0; a tick box until
 * then) beside a **controlled hidden input** carrying `1`/`0`.
 *
 * The hidden input is the whole reason this exists: an unchecked checkbox
 * posts nothing, and every settings action PATCHes only the keys it finds
 * in the form data — so a bare checkbox could switch a thing on and never
 * off. The visible box is for the person; the hidden one is what is saved.
 *
 * It re-asserts its own checked state after every render, because React 19
 * resets a form's controls when its action completes and a checkbox is
 * uncontrolled from the browser's point of view the moment that happens.
 * Written here once: the info bar, the ticket mailbox and the promo screen
 * each carried their own copy of this (2026-09-21), the info bar's with a
 * panel-level loop over every checkbox that this makes unnecessary.
 *
 * Controlled — the caller holds the state, since the value usually drives
 * something else on the screen (a preview, a disabled fieldset).
 */
export function SettingSwitch({
  id, name, checked, onChange, children, note, align = "center",
}: {
  id: string;
  /** The posted name — `setting__<key>` on a settings screen. */
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The label. */
  children: ReactNode;
  /** A line under the label, in the muted ink. */
  note?: ReactNode;
  /** `start` for a label that runs to more than one line. */
  align?: "center" | "start";
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.checked !== checked) ref.current.checked = checked;
  });

  return (
    <label
      htmlFor={id}
      className={align === "start" ? "flex cursor-pointer items-start gap-3 text-13-5" : "flex cursor-pointer items-center gap-2.5 text-13-5 font-semibold"}
    >
      <Switch
        ref={ref}
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={align === "start" ? "mt-px" : undefined}
      />
      <input type="hidden" name={name} value={checked ? "1" : "0"} />
      {note ? (
        <span>
          <span className="block font-semibold text-ink">{children}</span>
          <span className="block text-12-5 text-muted">{note}</span>
        </span>
      ) : children}
    </label>
  );
}
