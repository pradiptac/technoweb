import { safeReturnPath } from "@/lib/safe-return";
import type { FormField, FormFieldSettings, FormFileAccept, FormShowIf } from "@/types/api";

/**
 * What an editor-built form *means*, apart from how it is drawn: how its
 * fields split into steps, which of them a condition is hiding, where a
 * server error belongs, and where a successful submission may send somebody.
 *
 * No directive, deliberately. `form-block.tsx` is a client component, the
 * Server Action and the embed route handler run on the server, and all three
 * read from here — a constant or a function exported from a `"use client"`
 * file reaches server code as a reference rather than a value.
 *
 * Nothing in this file is a rule the API relies on. The API validates a
 * submission from the stored definition, skips and drops a field its
 * condition hides, and checks every upload itself; this is the same reading
 * of the same definition, made so the form on screen agrees with it.
 */

/* ------------------------------------------------------------------ steps */

/** One page of a form: the fields between two `step` breaks. */
export type StepGroup = {
  /** The `step` field's label, or null for the fields before the first break. */
  title: string | null;
  /** The fields on this page, each with its position in the whole form. */
  fields: { field: FormField; index: number }[];
};

/**
 * A form's fields, split at every `step` field.
 *
 * Fields before the first break are the first page and have no title of
 * their own. A form that *opens* on a break has no such fields, so that
 * empty leading page is dropped rather than drawn as a step with nothing on
 * it. A form with no break at all is one group — one page, no wizard.
 */
export function stepsOf(fields: FormField[]): StepGroup[] {
  const groups: StepGroup[] = [{ title: null, fields: [] }];

  fields.forEach((field, index) => {
    if (field.kind === "step") {
      groups.push({ title: field.label?.trim() || null, fields: [] });
      return;
    }
    groups[groups.length - 1].fields.push({ field, index });
  });

  // Only the untitled leading page can be dropped: a titled step the editor
  // left empty is still theirs, and the wizard skips a page with nothing to
  // show (see `form-block.tsx`).
  return groups[0].fields.length === 0 && groups.length > 1 ? groups.slice(1) : groups;
}

/* ------------------------------------------------------------- conditions */

/** An answer as the page holds it: text, or the ticked options of a group. */
export type FieldValue = boolean | string | string[];

/** What an untouched field holds — the state the server renders against. */
export function blankValue(field: FormField): FieldValue {
  return field.kind === "checkbox" ? false : field.kind === "checkboxes" ? [] : "";
}

/**
 * The names of the fields a condition is hiding, given a way to read each
 * field's current answer.
 *
 * Walked in order, because a condition names an **earlier** field: by the
 * time a field is reached, whether its source is showing is already known.
 * That is what makes chains resolve — a field whose source is hidden is
 * hidden too, whatever the source last held, since an answer nobody can see
 * is not one the visitor is giving.
 *
 * A condition naming a field that does not exist (or a later one) hides
 * nothing: failing open leaves a field on screen that the API may then drop,
 * where failing closed would hide a field the API may require.
 *
 * **This is `FormValidator::shown()` and `::passes()` in TypeScript, rule for
 * rule, and has to stay that.** The API drops a field its condition hides
 * and requires one it shows, so a disagreement in either direction is a
 * field the visitor filled in and lost, or a 422 about a field they were
 * never shown. Change one and change the other; `FormBuilderTest` pins the
 * PHP half.
 */
export function hiddenNames(fields: FormField[], read: (field: FormField) => FieldValue): string[] {
  const hidden = new Set<string>();
  const asked = new Map<string, FormField>();

  for (const field of fields) {
    // A heading or a step break is never a source: the API's walk does not
    // see layout rows at all, so a condition naming one points at nothing.
    const layout = field.kind === "heading" || field.kind === "step";
    const rule = field.show_if;

    // A step break and a stored `hidden` value carry no condition of their
    // own here: neither is a control the browser shows or hides.
    if (rule && rule.field && field.kind !== "step" && field.kind !== "hidden") {
      const source = asked.get(rule.field);
      if (source && (hidden.has(source.name) || !passes(rule, read(source)))) {
        hidden.add(field.name);
      }
    }

    if (!layout && field.name) asked.set(field.name, field);
  }

  return [...hidden];
}

/** The words a tick box's condition may be written in, as the API reads them. */
const TICKED = ["1", "true", "on", "yes"];
const UNTICKED = ["0", "false", "off", "no", ""];

function passes(rule: FormShowIf, answer: FieldValue): boolean {
  const filled = typeof answer === "boolean" ? answer : answer.length > 0;
  const value = wanted(rule.value);

  switch (rule.op) {
    case "filled": return filled;
    case "empty": return !filled;
    // One comparison for both: on a group of checkboxes "is" means
    // "includes" and "is not" means "does not include".
    case "equals":
    case "includes": return matches(answer, value);
    case "not_equals": return !matches(answer, value);
    // An operator this build does not know shows the field; the API decides.
    default: return true;
  }
}

/**
 * Does this answer equal — or, for a group, include — the value?
 *
 * Exact, case and all: an option's value is a key an editor wrote, not
 * prose. Two numbers compare as numbers, so a rating of `4` matches a value
 * written `4.0`. A tick box matches any of the words for its state.
 */
function matches(answer: FieldValue, value: string): boolean {
  if (Array.isArray(answer)) return answer.includes(value);

  if (typeof answer === "boolean") {
    return (answer ? TICKED : UNTICKED).includes(value.toLowerCase());
  }

  if (isNumeric(answer) && isNumeric(value)) return Number(answer.trim()) === Number(value.trim());

  return answer === value;
}

/** PHP's `is_numeric` for the strings a form can hold: a decimal or exponent number, whitespace around it allowed. */
function isNumeric(text: string): boolean {
  return /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/.test(text);
}

/** A condition's value as the API casts it to a string: `true` is `"1"`, `false` and nothing are `""`. */
function wanted(value: FormShowIf["value"]): string {
  if (value === true) return "1";
  if (value === false || value === null || value === undefined) return "";
  return String(value);
}

/* ----------------------------------------------------------------- errors */

/**
 * The server's message for a field.
 *
 * A group of checkboxes is validated as an array, so its message may arrive
 * under `interests` or under `interests.0` — and the second is about the
 * group as much as the first is.
 */
export function errorFor(errors: Record<string, string[]> | undefined, name: string): string | undefined {
  if (!errors || !name) return undefined;
  if (errors[name]?.[0]) return errors[name][0];

  const nested = Object.keys(errors).find((key) => key.startsWith(`${name}.`));
  return nested ? errors[nested]?.[0] : undefined;
}

/* ------------------------------------------------------------------ dates */

/** Today as a date input writes it, in the visitor's own timezone. */
export function localToday(): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/**
 * A date field's `min` or `max` as the input's attribute: a `Y-m-d` date as
 * it is, `"today"` as `today` — which is null until the page has hydrated,
 * because the server cannot know the visitor's date — and anything else as
 * no bound at all.
 */
export function dateBound(value: FormFieldSettings["min"], today: string | null): string | undefined {
  if (value === "today") return today ?? undefined;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

/** A number field's `min` or `max`, when it is one. */
export function numberBound(value: FormFieldSettings["min"]): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

/* ---------------------------------------------------------------- uploads */

/**
 * The extensions each family of file stands for.
 *
 * A fallback only. The public read sends `settings.extensions` — the API's
 * own list for the families the editor ticked — and that is what the picker
 * and the check below read. These stand in for an API that sends the
 * families and not the list, so the field still narrows the picker rather
 * than taking anything. The API's check on the bytes is the rule either way;
 * this is the courtesy before the upload.
 */
const FILE_EXTENSIONS: Record<FormFileAccept, string[]> = {
  image: ["jpg", "jpeg", "png", "webp", "gif"],
  pdf: ["pdf"],
  document: ["doc", "docx", "xls", "xlsx", "csv", "txt"],
};

const FILE_WORDS: Record<FormFileAccept, string> = {
  image: "images (JPG, PNG, WebP, GIF)",
  pdf: "PDF",
  document: "documents (Word, Excel, CSV, text)",
};

function families(settings: FormFieldSettings | null | undefined): FormFileAccept[] {
  const listed = Array.isArray(settings?.accept) ? settings.accept : [];
  return (Object.keys(FILE_EXTENSIONS) as FormFileAccept[]).filter((family) => listed.includes(family));
}

/**
 * The extensions an upload field takes, lower-case and without dots, or an
 * empty list when it states none (and so takes whatever the API will).
 */
export function fileExtensions(settings: FormFieldSettings | null | undefined): string[] {
  const sent = Array.isArray(settings?.extensions)
    ? settings.extensions.filter((ext): ext is string => typeof ext === "string")
    : [];
  const list = sent.length ? sent : families(settings).flatMap((family) => FILE_EXTENSIONS[family]);

  return [...new Set(list.map((ext) => ext.trim().toLowerCase().replace(/^\./, "")).filter(Boolean))];
}

/** The `accept` attribute for an upload field, or undefined when it states no extension. */
export function fileAccept(settings: FormFieldSettings | null | undefined): string | undefined {
  const list = fileExtensions(settings);
  return list.length ? list.map((ext) => `.${ext}`).join(",") : undefined;
}

/**
 * Whether a file's name ends in one of the field's extensions.
 *
 * By name, because that is all a browser can say before the upload; the API
 * reads the bytes. A field that states no extension refuses nothing here.
 */
export function fileExtensionAllowed(name: string, settings: FormFieldSettings | null | undefined): boolean {
  const list = fileExtensions(settings);
  if (!list.length) return true;

  const dot = name.lastIndexOf(".");
  return dot >= 0 && list.includes(name.slice(dot + 1).toLowerCase());
}

/** The largest upload a field takes, in bytes, or null when it states none. */
export function fileMaxBytes(settings: FormFieldSettings | null | undefined): number | null {
  const kb = settings?.max_kb;
  return typeof kb === "number" && Number.isFinite(kb) && kb > 0 ? Math.round(kb * 1024) : null;
}

/** "Images (JPG, PNG, WebP, GIF), PDF or documents (Word, Excel, CSV, text)", or null. */
export function fileKinds(settings: FormFieldSettings | null | undefined): string | null {
  // The families' own words where the API names them; otherwise the
  // extensions themselves, which say the same thing less gracefully.
  const named = families(settings).map((family) => FILE_WORDS[family]);
  const words = named.length ? named : fileExtensions(settings).map((ext) => ext.toUpperCase());
  if (!words.length) return null;

  const joined = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/* --------------------------------------------------------------- redirect */

/**
 * Where a successful submission may send somebody, or null.
 *
 * The API validates `redirect_url` when an editor saves it, and this checks
 * it again at the point it is followed: a **path on this site** (never
 * `//host` or `/\host`, which a browser reads as another site — the rule
 * `safeReturnPath` already keeps), or an absolute **http(s)** URL. Anything
 * else — `javascript:`, `data:`, a bare word — is no redirect at all, and
 * the visitor sees the success message instead.
 */
export function safeRedirectTarget(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const target = value.trim();
  if (target === "" || target.length > 2048) return null;

  if (target.startsWith("/")) return safeReturnPath(target, "") || null;

  if (!/^https?:\/\//i.test(target) || /[\s\\\u0000-\u001f\u007f]/.test(target)) return null;

  try {
    const url = new URL(target);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname ? target : null;
  } catch {
    return null;
  }
}
