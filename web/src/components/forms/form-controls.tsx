"use client";

import { useState, type ChangeEvent, type ReactNode } from "react";
import { Field, FileInput, Input, Select, Textarea } from "@/components/ui/input";
import { formatBytes } from "@/lib/format-bytes";
import { cn } from "@/lib/utils";
import {
  dateBound, fileAccept, fileExtensionAllowed, fileKinds, fileMaxBytes, localToday, numberBound,
} from "./form-logic";
import type { FormField } from "@/types/api";

/**
 * One field of an editor-built form, drawn by its `kind`.
 *
 * ## The two flags every control takes
 *
 * `hydrated` is false in the server's HTML and in the first client render,
 * and true ever after. `off` says the field's condition is hiding it. Between
 * them they decide three things, and the order matters:
 *
 * - **Before hydration nothing is disabled and no conditional field is
 *   `required`.** A visitor without JavaScript gets every field, visible and
 *   fillable, and the API decides what was owed — it skips and drops a field
 *   its condition hides, so an answer typed into one costs nothing.
 * - **After it, a field that is `off` is `hidden` and its controls are
 *   `disabled`.** Hidden so it is not seen, disabled so it is not posted and
 *   the browser does not ask for it; both, because either alone is half.
 * - **A conditional field that is showing is `required` as its definition
 *   says** — which is what the step check reads before it lets somebody on.
 *
 * `data-form-wait` is the first paint: see `globals.css` beside
 * `[data-form-wait]` for what it does and what it deliberately does not.
 *
 * ## What is not here
 *
 * `hidden` draws nothing and posts nothing: the API stores its value from the
 * form's own definition, so an input here would only be a value the visitor
 * could edit. `step` is a page break and is consumed by `stepsOf()`.
 */

export type HeadingLevel = 2 | 3 | 4;

type ControlProps = {
  field: FormField;
  slug: string;
  error?: string;
  hydrated: boolean;
  /** Hidden by its `show_if` right now. */
  off: boolean;
  headingLevel: HeadingLevel;
};

/** What every kind's own component is handed. */
type Drawn = {
  field: FormField;
  id: string;
  error?: string;
  required: boolean;
  disabled: boolean;
};

/** Kinds that take the whole row whatever `width` says: there is no half of a paragraph. */
const ALWAYS_FULL = new Set<FormField["kind"]>(["textarea", "heading"]);

export function FormControl({ field, slug, error, hydrated, off, headingLevel }: ControlProps) {
  if (field.kind === "hidden" || field.kind === "step") return null;

  const drawn: Drawn = {
    field,
    id: `${slug}-${field.name}`,
    error,
    // A conditional field asks for nothing until the page can also hide it.
    required: field.required && (!field.show_if || hydrated),
    disabled: hydrated && off,
  };

  return (
    <div
      className={cn("min-w-0", (field.width !== "half" || ALWAYS_FULL.has(field.kind)) && "sm:col-span-2")}
      hidden={hydrated && off}
      data-form-wait={!hydrated && off ? "" : undefined}
    >
      {field.kind === "heading" ? <HeadingRow field={field} level={headingLevel} />
        : field.kind === "checkbox" ? <TickControl {...drawn} />
        : field.kind === "radio" ? <ChoiceGroup {...drawn} />
        : field.kind === "checkboxes" ? <ChoiceGroup {...drawn} multiple />
        : field.kind === "rating" ? <RatingControl {...drawn} />
        : field.kind === "file" ? <FileControl {...drawn} />
        : <TextControl {...drawn} hydrated={hydrated} />}
    </div>
  );
}

/* ---------------------------------------------------------------- layout */

/**
 * A heading in the middle of a form, with the paragraph under it.
 *
 * Its level is the caller's: a form sits under a section's `h2` almost
 * everywhere, so the default is an `h3` — but a form in the embed frame, or
 * dropped into a body that has no `h2` above it, would then skip a level, so
 * `FormBlock` takes `headingLevel` and those callers pass 2.
 */
function HeadingRow({ field, level }: { field: FormField; level: HeadingLevel }) {
  const Tag = `h${level}` as const;

  return (
    <div className="mt-1 mb-[18px]">
      <Tag className="text-17 font-semibold text-ink [overflow-wrap:anywhere]">{field.label}</Tag>
      {field.help && <p className="mt-1 text-14 text-muted">{field.help}</p>}
    </div>
  );
}

/* --------------------------------------------------------- text and lists */

/**
 * Everything that is one box: text, email, phone, number, link, date, long
 * text and a dropdown.
 *
 * A date and a dropdown take the static label. Both always show something in
 * the box — a format mask, the chosen option — so a resting label has nothing
 * to be displaced by and would be drawn on top of it.
 */
function TextControl({ field, id, error, required, disabled, hydrated }: Drawn & { hydrated: boolean }) {
  const shared = {
    id,
    name: field.name,
    required,
    disabled,
    "aria-invalid": Boolean(error),
    placeholder: field.placeholder ?? undefined,
  };

  /*
    `"today"` is resolved in the browser, after hydration, and never on the
    server. This component is rendered into pages that are cached for minutes
    to hours, so a date worked out there would be baked into the HTML and
    wrong by tomorrow — and the server's date and the visitor's can differ at
    any moment across timezones, which is a hydration mismatch on the
    attribute. Until hydration the bound is simply absent: the API holds it.
  */
  const today = hydrated ? localToday() : null;

  return (
    <Field
      label={field.label}
      htmlFor={id}
      hint={field.help ?? undefined}
      error={error}
      variant={field.kind === "select" || field.kind === "date" ? "float-static" : "float"}
    >
      {field.kind === "textarea" ? (
        <Textarea {...shared} rows={5} />
      ) : field.kind === "select" ? (
        <Select {...shared}>
          <option value="">Choose…</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      ) : field.kind === "date" ? (
        <Input
          {...shared}
          type="date"
          min={dateBound(field.settings?.min, today)}
          max={dateBound(field.settings?.max, today)}
        />
      ) : field.kind === "number" ? (
        // `step="any"`: the default step of 1 calls 2.5 invalid, and whether a
        // fraction is acceptable is the API's decision, not the keypad's.
        <Input
          {...shared}
          type="number"
          inputMode="decimal"
          step="any"
          min={numberBound(field.settings?.min)}
          max={numberBound(field.settings?.max)}
        />
      ) : field.kind === "url" ? (
        <Input {...shared} type="url" inputMode="url" autoComplete="url" />
      ) : (
        <Input
          {...shared}
          type={field.kind === "email" ? "email" : field.kind === "tel" ? "tel" : "text"}
          autoComplete={autoCompleteFor(field)}
        />
      )}
    </Field>
  );
}

/**
 * A best guess at what a browser should offer to fill in.
 *
 * Keyed on the field's own name, which is the only signal available — an
 * editor naming a field `email` means the same thing everyone else does. Wrong
 * guesses cost nothing; a missing one costs the visitor typing their own
 * address again.
 */
function autoCompleteFor(field: FormField): string | undefined {
  if (field.kind === "email") return "email";
  if (field.kind === "tel") return "tel";

  const known: Record<string, string> = {
    name: "name",
    company: "organization",
    organisation: "organization",
    city: "address-level2",
    town: "address-level2",
    state: "address-level1",
    country: "country-name",
    pin: "postal-code",
    pincode: "postal-code",
    pin_code: "postal-code",
    postcode: "postal-code",
    postal_code: "postal-code",
  };

  return known[field.name];
}

/* ---------------------------------------------------------------- choices */

/** The hint or the error under a group, and the id a `fieldset` points at. */
function GroupFoot({ id, help, error }: { id: string; help: string | null; error?: string }): ReactNode {
  if (error) return <p id={`${id}-error`} className="mt-1.5 text-12-5 text-err">{error}</p>;
  if (help) return <p id={`${id}-hint`} className="mt-1.5 text-12-5 text-faint">{help}</p>;
  return null;
}

const describedBy = (id: string, help: string | null, error?: string) =>
  error ? `${id}-error` : help ? `${id}-hint` : undefined;

/** The label over a group, set as `Field`'s own label-above is. */
const legend = "mb-[7px] block p-0 text-13-5 font-semibold";

/**
 * A single tick — "I agree", "send me the brochure".
 *
 * Its label sits beside it rather than floating over it, so it does not go
 * through `Field`. Posts `1` when ticked and nothing when not, which is what
 * the API reads as true and false.
 */
function TickControl({ field, id, error, required, disabled }: Drawn) {
  return (
    <div className="mb-[18px]">
      <label htmlFor={id} className="flex min-h-6 cursor-pointer items-start gap-2.5 text-14">
        <input
          id={id}
          type="checkbox"
          name={field.name}
          value="1"
          required={required}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(id, null, error)}
          className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-brand-600"
        />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {field.label}
          {field.help && <span className="mt-0.5 block text-12-5 text-faint">{field.help}</span>}
        </span>
      </label>
      <GroupFoot id={id} help={null} error={error} />
    </div>
  );
}

/**
 * Pick one (`radio`) or pick any (`checkboxes`).
 *
 * A `fieldset` with a `legend`, so the question is announced with every
 * option rather than once and then forgotten. Options run down the column:
 * side by side they would be a row that wraps mid-list on a phone, and a
 * list of four is read faster top to bottom at any width. Each row is 32px
 * and the whole row is the label, so the target is the row and not the 18px
 * box — and two boxes are never within 24px of each other, which is what the
 * phone audit measures.
 *
 * A group of checkboxes posts as `name[]`, which reaches the API as an array
 * whichever way the submission travels. "At least one" cannot be said with
 * `required` — on a checkbox that means *this* one — so a required group is
 * marked `data-form-group` and the step check asks it directly.
 */
function ChoiceGroup({ field, id, error, required, disabled, multiple = false }: Drawn & { multiple?: boolean }) {
  const options = field.options ?? [];

  // A message the step check left on the group's first box is about a state
  // the visitor has just changed.
  const clearGroupMessage = (event: ChangeEvent<HTMLInputElement>) => {
    event.currentTarget.closest("fieldset")
      ?.querySelectorAll<HTMLInputElement>("input")
      .forEach((box) => box.setCustomValidity(""));
  };

  return (
    <fieldset
      className="mb-[18px] min-w-0"
      aria-describedby={describedBy(id, field.help, error)}
      data-form-group={multiple && required ? "required" : undefined}
    >
      <legend className={legend}>{field.label}</legend>
      <div className="grid">
        {options.map((option, i) => (
          <label
            key={option.value}
            htmlFor={`${id}-${i}`}
            className="flex min-h-8 cursor-pointer items-start gap-2.5 py-1.5 text-14"
          >
            <input
              id={`${id}-${i}`}
              type={multiple ? "checkbox" : "radio"}
              name={multiple ? `${field.name}[]` : field.name}
              value={option.value}
              required={!multiple && required}
              disabled={disabled}
              // A checkbox can be invalid; a radio cannot say so (ARIA gives
              // the role no such state), and the group's error is already
              // what the fieldset is described by.
              aria-invalid={multiple ? Boolean(error) : undefined}
              onChange={multiple ? clearGroupMessage : undefined}
              className="mt-px size-[18px] shrink-0 cursor-pointer accent-brand-600"
            />
            <span className="min-w-0 [overflow-wrap:anywhere]">{option.label}</span>
          </label>
        ))}
      </div>
      <GroupFoot id={id} help={field.help} error={error} />
    </fieldset>
  );
}

/* ----------------------------------------------------------------- rating */

const STAR = "M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.47L12 17.46l-5.8 3.06 1.1-6.47-4.7-4.6 6.5-.95z";

/**
 * One to five stars.
 *
 * Five radio buttons, the pattern the portal's reply verdict and the shop's
 * review use: a group with one value is what a screen reader should hear,
 * Tab reaches it once and the arrow keys move the choice. Each input is
 * `sr-only` inside its label, each label is a 40px target, and each says
 * "N out of 5" to a screen reader while the legend carries the question.
 *
 * **Uncontrolled, and lit by CSS rather than by state** (`[data-form-rating]`
 * in `globals.css`): a star is gold when its own input or any later one is
 * checked, and under a pointer the row lights to the star about to be
 * chosen. That keeps the value in the DOM, where `<Form>` puts it back after
 * a refused submission and the conditions read it, with no second copy in
 * React to disagree. Colours are `--color-rating` and `--color-rating-empty`,
 * the shop's review stars, held to 3:1 by `npm run themes`.
 */
function RatingControl({ field, id, error, required, disabled }: Drawn) {
  return (
    <fieldset className="mb-[18px] min-w-0" aria-describedby={describedBy(id, field.help, error)}>
      <legend className={legend}>{field.label}</legend>
      <div className="-ml-1.5 flex w-fit" data-form-rating>
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            htmlFor={`${id}-${n}`}
            title={`${n} out of 5`}
            className="relative cursor-pointer rounded p-1.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600"
          >
            <input
              id={`${id}-${n}`}
              type="radio"
              name={field.name}
              value={n}
              required={required}
              disabled={disabled}
              className="sr-only"
            />
            <svg viewBox="0 0 24 24" aria-hidden="true" className="block size-7">
              <path d={STAR} strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
            <span className="sr-only">{n} out of 5</span>
          </label>
        ))}
      </div>
      <GroupFoot id={id} help={field.help} error={error} />
    </fieldset>
  );
}

/* ------------------------------------------------------------------- file */

/**
 * One upload.
 *
 * `FileInput`, not `FileDrop`. This field takes exactly one file, and the
 * native control is the one that names the chosen file by itself: `FileDrop`
 * keeps its list in React state, so without JavaScript somebody picks a file
 * and the form shows nothing to say it took. What `FileDrop` adds — several
 * files, a paste, a measured bar — is what a ticket reply needs and this
 * does not.
 *
 * The hint states what is accepted and how large, from what the public read
 * sends: `settings.extensions` (the API's own list for the families ticked)
 * and `settings.max_kb` (the limit in force — the field's, never above the
 * server's). Both are checked the moment a file is chosen rather than at
 * submit: a file of the wrong kind or over the limit is **taken back out**
 * and the line under the field says why, so nobody writes the rest of the
 * form believing it is attached and learns otherwise from a 422. Because it
 * is taken out, nothing that fails either check can be in the form when it
 * is sent. That line is `Field`'s `note`, armed empty so it is a live region
 * before it speaks. The picker's `accept` narrows what is offered, but a
 * file dragged onto the control ignores it — hence the check.
 */
function FileControl({ field, id, error, required, disabled }: Drawn) {
  const [note, setNote] = useState("");
  const max = fileMaxBytes(field.settings);
  const kinds = fileKinds(field.settings);

  const limits = [kinds, max ? `up to ${formatBytes(max)}` : null].filter(Boolean).join(", ");
  const hint = [field.help, limits ? `${limits}.` : null].filter(Boolean).join(" ");

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    // The kind first: a file of the wrong kind is wrong at any size.
    if (file && !fileExtensionAllowed(file.name, field.settings)) {
      input.value = "";
      setNote(`${file.name} is not a kind of file this takes${kinds ? ` (${kinds})` : ""} — it was not attached.`);
      return;
    }

    if (file && max && file.size > max) {
      input.value = "";
      setNote(
        `${file.name} is ${formatBytes(file.size)}, and this takes files up to ${formatBytes(max)} — it was not attached. Choose a smaller file.`,
      );
      return;
    }

    setNote("");
  };

  return (
    <Field label={field.label} htmlFor={id} hint={hint || undefined} error={error} note={note} variant="above">
      <FileInput
        id={id}
        name={field.name}
        accept={fileAccept(field.settings)}
        required={required}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        onChange={onChange}
      />
    </Field>
  );
}
