"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Field, Input } from "@/components/ui/input";

/**
 * The company field, suggesting names the shop already holds.
 *
 * Three people from one firm register over three months and the console ends
 * up with "Meridian Foods", "Meridian foods pvt ltd" and "meridian" — nothing
 * joins those, so the support desk cannot see they are one account's worth of
 * people. Offering the name back is the whole fix, and it has to be offered
 * rather than enforced: a genuinely new firm whose name starts the same way
 * must be able to type straight past it.
 *
 * ## A `<datalist>`, not a listbox
 *
 * The same call the PIN code's city suggestions make. A native datalist adds
 * suggestions **without adding a single tap target** — `npm run audit` counts
 * those, and a hand-rolled combobox is a listbox, a roving tabindex and
 * keyboard handling that has to be right on the first arrow press and the
 * last. It also degrades to a plain text input everywhere it is unsupported,
 * which is the correct failure for a convenience.
 *
 * ## The lookup is debounced and abortable
 *
 * One request per keystroke on a public form is a request per keystroke from
 * everybody. 250ms is long enough to cover typing and short enough that the
 * list is there by the time somebody looks up. An in-flight request is
 * aborted rather than raced, or a slow answer for "me" can land after the
 * answer for "meridian" and replace it.
 */
export function CompanyField({
  label = "Company",
  name = "company",
  error,
  defaultValue,
  required,
}: {
  label?: string;
  name?: string;
  error?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const listId = useId();
  const [term, setTerm] = useState(defaultValue ?? "");
  const [names, setNames] = useState<string[]>([]);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = term.trim();

    if (query.length < 3) {
      setNames([]);
      return;
    }

    const timer = setTimeout(async () => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      try {
        const response = await fetch(`/api/companies?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;

        const body = (await response.json()) as { data: string[] };
        setNames(body.data ?? []);
      } catch {
        /*
         * A suggestion that does not arrive is not an error anybody can act
         * on, and this sits on a registration form. Say nothing, offer
         * nothing, and leave what was typed exactly as it is — the rule
         * `PincodeAutofill` follows for a failed lookup.
         */
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      inFlight.current?.abort();
    };
  }, [term]);

  return (
    <Field label={label} htmlFor={name} error={error}
      hint="If a colleague has registered, start typing and pick the same name.">
      <Input
        id={name}
        name={name}
        list={listId}
        autoComplete="organization"
        required={required}
        defaultValue={defaultValue}
        onChange={(e) => setTerm(e.target.value)}
        aria-invalid={Boolean(error)}
      />
      <datalist id={listId}>
        {names.map((company) => <option key={company} value={company} />)}
      </datalist>
    </Field>
  );
}
