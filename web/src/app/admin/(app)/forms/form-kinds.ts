import type { FormKindOption, FormMeta, FormOpOption } from "@/lib/admin";

/**
 * What the builder, the embed panel and the submissions screen all need to
 * know about a field kind — read off the API's `meta.kinds`, never listed.
 *
 * This module carries no directive on purpose: the builder is a client
 * component and the submissions screen a server one, and a constant exported
 * from a `"use client"` file reaches a server component as a reference rather
 * than a value (the `COMPARE_MAX` lesson).
 */

/**
 * The seven kinds a form had before the builder was widened.
 *
 * A fallback, not a second list: it is used only when the API sends no
 * `meta.kinds` at all — an older API, which accepts exactly these — so the
 * Type select is never empty. Everything newer arrives from the API or not at
 * all, and with it the buttons, panels and conditions that depend on it.
 */
const LEGACY_KINDS: FormKindOption[] = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "tel", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "textarea", label: "Long text" },
  { value: "select", label: "Dropdown", takes_options: true },
  { value: "checkbox", label: "Checkbox" },
];

export function kindsFrom(meta: FormMeta | undefined): FormKindOption[] {
  return meta?.kinds?.length ? meta.kinds : LEGACY_KINDS;
}

/** An operator with the one flag settled, whichever name the API sent it under. */
export type ConditionOp = { value: string; label: string; needs_value: boolean };

export function opsFrom(meta: FormMeta | undefined): ConditionOp[] {
  return (meta?.ops ?? []).map((op: FormOpOption) => ({
    value: op.value,
    label: op.label,
    needs_value: op.takes_value ?? op.needs_value ?? true,
  }));
}

/**
 * How many upload fields a form may hold when the API does not say
 * (`meta.max_file_fields`). The API refuses one more on `fields.N.kind`; the
 * picker says so first.
 */
export const MAX_FILE_FIELDS = 3;

/** How many rows — fields, headings and step breaks together — one form may hold. The API's `fields` rule. */
export const MAX_FIELD_ROWS = 50;

/** The contract's own bounds for one upload, in KB, before the server's cap is applied. */
export const FILE_MIN_KB = 100;
export const FILE_MAX_KB = 20480;
export const FILE_DEFAULT_KB = 5120;

const find = (kinds: FormKindOption[], kind: string) => kinds.find((k) => k.value === kind);

/** A heading or a step break: laid out, never answered. */
export function isLayoutKind(kinds: FormKindOption[], kind: string): boolean {
  return find(kinds, kind)?.is_layout ?? (kind === "heading" || kind === "step");
}

export function isFileKind(kinds: FormKindOption[], kind: string): boolean {
  return find(kinds, kind)?.is_file ?? kind === "file";
}

export function takesOptions(kinds: FormKindOption[], kind: string): boolean {
  return find(kinds, kind)?.takes_options ?? (kind === "select" || kind === "radio" || kind === "checkboxes");
}

export function kindLabel(kinds: FormKindOption[], kind: string): string {
  return find(kinds, kind)?.label ?? kind;
}

/**
 * Whether a condition may read this field: an answer the visitor gives, in
 * the page, as text. An upload has no value to compare, a hidden field is not
 * the visitor's, and a heading or a step break is not a field at all.
 */
export function canBeConditionSource(kinds: FormKindOption[], kind: string): boolean {
  return find(kinds, kind)?.is_condition_source
    ?? (!isLayoutKind(kinds, kind) && !isFileKind(kinds, kind) && kind !== "hidden");
}

/**
 * Whether "Show this field only when…" is offered on a row of this kind.
 *
 * Every row a page shows or hides: a question, and a heading too — a
 * heading over three conditional fields that stays behind when they go is
 * a title over nothing. Not a step break, which is a page boundary, and not
 * a hidden value, which the page never draws.
 */
export function canCarryCondition(kind: string): boolean {
  return kind !== "step" && kind !== "hidden";
}

/**
 * Whether a form can only be put on another site as a frame.
 *
 * Uploads, steps and conditions are behaviour — a multipart post, a wizard,
 * fields that appear — and the HTML snippet is plain markup with a
 * fifteen-line script. Offering it for such a form would hand somebody a copy
 * that silently lacks the parts they built.
 */
export function needsFrame(kinds: FormKindOption[], fields: { kind: string; show_if?: unknown }[]): boolean {
  return fields.some((f) => isFileKind(kinds, f.kind) || f.kind === "step" || Boolean(f.show_if));
}
