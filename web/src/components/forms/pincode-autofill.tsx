"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Fills country, state and city from a PIN code, and gets out of the way.
 *
 * An Indian PIN code is administered top-down — the first digit is a region,
 * the first three a sorting district — so six digits determine the state and
 * very nearly determine the town. That makes it the one field on an address
 * worth asking for first: it fills three others, and the three it fills are
 * the ones people misspell, abbreviate, or write six different ways.
 *
 * ## Nothing it writes is locked
 *
 * Every field stays an ordinary editable input. The lookup is a **suggestion
 * that types itself**, and there are two reasons it has to be:
 *
 * - **1,229 of the 19,097 PIN codes straddle a district boundary.** 400001 is
 *   Mumbai and also Raigarh. A form that picks one and locks it is confidently
 *   wrong on more than a thousand PIN codes, and the person holding the parcel
 *   knows better than the table does.
 * - District is not city. 700091 is "North 24 Parganas", and everybody living
 *   there writes "Kolkata" or "Salt Lake". The alternatives this PIN covers
 *   are offered through a `<datalist>` on the city field, which adds
 *   suggestions without adding a single tap target — the audit counts those.
 *
 * So a field is only written when it is **empty or still holds exactly what
 * was put there last time**. Type over the city and change the PIN code, and
 * the city you typed stays. That rule is the whole of "editable" meaning
 * something.
 *
 * ## How it finds the fields
 *
 * By `name`, through `closest("form")`, rather than by being handed refs.
 * Address fields are spread across a grid in one form and threading four refs
 * out of `Field`, which clones its child to add `aria-describedby`, would put
 * this component's plumbing into every form that wants it. The names default
 * to the checkout's; an editor-built form passes its own.
 *
 * ## The lookup is a fetch, not a bundle
 *
 * The table is 783KB and lives on the server behind `/api/pincode/[code]`. A
 * page where somebody is about to pay does not need three quarters of a
 * megabyte to save one 200-byte request, and every visitor would pay it for
 * the few buying something shipped.
 */

type Place = {
  pin: string;
  country: string;
  state: string;
  city: string;
  suggestions: string[];
};

export type PincodeFieldNames = {
  pin?: string;
  country?: string;
  state?: string;
  city?: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "looking"; pin: string }
  | { kind: "found"; place: Place }
  | { kind: "unknown"; pin: string }
  | { kind: "offline" };

export function PincodeAutofill({
  names = {},
  className,
}: {
  names?: PincodeFieldNames;
  className?: string;
}) {
  const { pin = "pin", country = "country", state = "state", city = "city" } = names;

  const anchor = useRef<HTMLSpanElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const listId = useId();

  /**
   * What this component last wrote into each field.
   *
   * The permission to overwrite: a field holding exactly what was put there is
   * a field nobody has touched, and a field holding anything else is somebody's
   * answer. Without this, correcting a PIN code typo would silently discard a
   * city that had been fixed by hand.
   */
  const written = useRef<Record<string, string>>({});
  const inFlight = useRef<AbortController | null>(null);
  const lastLooked = useRef<string>("");

  const fieldsOf = useCallback((form: HTMLFormElement) => {
    const get = (name: string) => form.elements.namedItem(name);
    const input = (name: string) => (get(name) instanceof HTMLInputElement ? (get(name) as HTMLInputElement) : null);
    return { country: input(country), state: input(state), city: input(city) };
  }, [country, state, city]);

  const fill = useCallback(
    (form: HTMLFormElement, place: Place | null) => {
      const fields = fieldsOf(form);
      const values: Record<string, string> = place
        ? { [country]: place.country, [state]: place.state, [city]: place.city }
        : {};

      for (const [key, el] of Object.entries(fields)) {
        if (!el) continue;
        const name = el.name;
        const next = values[name] ?? "";
        if (!next) continue;

        const untouched = el.value.trim() === "" || el.value === written.current[name];
        if (!untouched) continue;

        el.value = next;
        written.current[name] = next;
        /*
         * A programmatic assignment fires nothing, so anything listening for
         * `input` on these fields — a floating label, a future validator —
         * would never hear about a value that visibly changed.
         */
        el.dispatchEvent(new Event("input", { bubbles: true }));
        void key;
      }
    },
    [fieldsOf, country, state, city],
  );

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;

    const field = form.elements.namedItem(pin);
    if (!(field instanceof HTMLInputElement)) return;

    // Suggestions for the city field, attached here rather than in the markup
    // so a form gains them by dropping this component in.
    const cityField = fieldsOf(form).city;
    if (cityField) cityField.setAttribute("list", listId);

    async function look() {
      const code = field instanceof HTMLInputElement ? field.value.replace(/\D/g, "") : "";

      if (code.length < 6) {
        // Backspacing out of a complete PIN code clears the message, but never
        // the fields — half a typed PIN code is not a statement that the
        // address is wrong.
        lastLooked.current = "";
        setStatus({ kind: "idle" });
        return;
      }
      if (code === lastLooked.current) return;
      lastLooked.current = code;

      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      setStatus({ kind: "looking", pin: code });

      try {
        const response = await fetch(`/api/pincode/${code}`, { signal: controller.signal });
        if (response.status === 404) {
          setStatus({ kind: "unknown", pin: code });
          return;
        }
        if (!response.ok) throw new Error(String(response.status));

        const place = ((await response.json()) as { data: Place }).data;
        if (form) fill(form, place);
        setStatus({ kind: "found", place });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        /*
         * A failed lookup is not a failed address. Say the three fields need
         * filling in by hand and leave everything exactly as it is — the one
         * thing that must not happen on a checkout is a convenience taking the
         * form down with it.
         */
        setStatus({ kind: "offline" });
      }
    }

    field.addEventListener("input", look);
    // A PIN code arriving from the browser's autofill fires `change`, not
    // `input`, in some browsers, and one restored by `Form` after a refused
    // submission fires neither — so the first look happens on mount too.
    field.addEventListener("change", look);
    void look();

    return () => {
      field.removeEventListener("input", look);
      field.removeEventListener("change", look);
      inFlight.current?.abort();
    };
  }, [pin, listId, fill, fieldsOf]);

  const message =
    status.kind === "looking"
      ? `Looking up ${status.pin}…`
      : status.kind === "found"
        ? `Country, state and city filled in from ${status.place.pin}. Change any of them if they are not right.`
        : status.kind === "unknown"
          ? `We do not have ${status.pin} on file. Fill in the country, state and city yourself — the address will still reach you.`
          : status.kind === "offline"
            ? "We could not look that PIN code up just now. Fill in the country, state and city yourself."
            : "";

  return (
    <>
      <span ref={anchor} hidden />
      {/*
        Mounted empty and kept mounted. A live region that appears with its
        message already inside it has not *changed*, so nothing is announced —
        the trap `PasswordField` documents for `Field`'s `note`.
      */}
      <p
        role="status"
        aria-live="polite"
        /*
          Kept mounted and given its margin only when it has something to say.
          An empty `<p>` draws no line box but still spends its margin, and on
          the checkout — where this sits between two rows of fields — that was
          18px of nothing on a screen whose whole problem is height.
        */
        className={cn("text-[12.5px] text-muted", message && "mb-[18px]", className)}
      >
        {message}
      </p>
      <datalist id={listId}>
        {status.kind === "found"
          ? status.place.suggestions.map((name) => <option key={name} value={name} />)
          : null}
      </datalist>
    </>
  );
}
