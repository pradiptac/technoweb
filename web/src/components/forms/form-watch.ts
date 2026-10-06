"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { blankValue, hiddenNames, type FieldValue } from "./form-logic";
import type { FormField } from "@/types/api";

/**
 * The live answers of an editor-built form, read straight from its controls.
 *
 * ## Why the DOM is the store
 *
 * Every control in `FormBlock` is uncontrolled, and has to stay that way:
 * `<Form>` puts back what was typed after a refused submission by writing to
 * the controls, and a second copy of each value in React state would be a
 * copy that write never reaches. So the form element *is* the state, and
 * conditions subscribe to it the way anything subscribes to something React
 * does not own — `useSyncExternalStore`, fed by the `input` and `change`
 * events that bubble to the form.
 *
 * ## Why it is an object and not a ref
 *
 * The watch comes with a ref callback for any element inside the form; it
 * finds the `<form>` with `closest()`, as `PincodeAutofill` does, because
 * `<Form>` owns the form element's own ref. Holding the element in a plain
 * closure rather than a `useRef` is what lets `getSnapshot` read it during
 * render without that being a ref read during render.
 *
 * ## What the server renders
 *
 * The server snapshot — and so the first client render — is every condition
 * evaluated against an untouched form. Once the controls exist the snapshot
 * is read from them instead, which is also what picks up a browser that
 * restored somebody's answers on the way back to the page.
 */
export type FormWatch = {
  subscribe: (listener: () => void) => () => void;
  /** The form element, once attached. */
  form: () => HTMLFormElement | null;
  /**
   * Re-read the controls. For the one change no event announces: `<Form>`
   * writing the submitted values back after a refusal.
   */
  refresh: () => void;
};

/** The ref callback that points a watch at its form: put it on any element inside the form. */
export type AttachForm = (node: HTMLElement | null) => (() => void) | undefined;

function createWatch(): { watch: FormWatch; attach: AttachForm } {
  let form: HTMLFormElement | null = null;
  const listeners = new Set<() => void>();
  const refresh = () => listeners.forEach((listener) => listener());

  const attach: AttachForm = (node) => {
    const found = node?.closest("form") ?? null;
    if (!found) return undefined;

    form = found;
    found.addEventListener("input", refresh);
    found.addEventListener("change", refresh);

    return () => {
      found.removeEventListener("input", refresh);
      found.removeEventListener("change", refresh);
      if (form === found) form = null;
    };
  };

  const watch: FormWatch = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    form: () => form,
    refresh,
  };

  return { watch, attach };
}

/**
 * One watch per mounted form, stable for its life, and the ref callback that
 * attaches it. Two values rather than one object with the callback on it: a
 * property read off something handed to `ref` is, to the linter, a ref being
 * read during render.
 */
export function useFormWatch(): [FormWatch, AttachForm] {
  const [made] = useState(createWatch);
  return [made.watch, made.attach];
}

/** The controls a name stands for: one element, or a group sharing the name. */
function controlsNamed(form: HTMLFormElement, name: string): Element[] {
  const item = form.elements.namedItem(name);
  if (!item) return [];
  return item instanceof RadioNodeList ? (Array.from(item) as Element[]) : [item];
}

/**
 * What a field currently holds, in the one shape a condition compares —
 * `FormValidator::answer()` read off the controls instead of the payload: a
 * tick box is ticked or not, a group is the values ticked, and everything
 * else is its text, trimmed.
 */
function readField(form: HTMLFormElement, field: FormField): FieldValue {
  if (field.kind === "checkboxes") {
    return controlsNamed(form, `${field.name}[]`)
      .filter((el): el is HTMLInputElement => el instanceof HTMLInputElement && el.checked)
      .map((el) => el.value)
      .filter((value) => value !== "");
  }

  const controls = controlsNamed(form, field.name);
  const ticked = controls.find((el): el is HTMLInputElement => el instanceof HTMLInputElement && el.checked);

  if (field.kind === "checkbox") return ticked !== undefined;
  if (field.kind === "radio" || field.kind === "rating") return ticked ? ticked.value.trim() : "";

  const control = controls[0];
  return control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement
    ? control.value.trim()
    : "";
}

const noop = () => () => {};

/**
 * False in the server's HTML and in the render that hydrates it, true from
 * the next one on — without an effect setting state, which is the cascading
 * render `react-hooks/set-state-in-effect` refuses.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

/**
 * The names of the fields whose `show_if` is hiding them right now.
 *
 * The snapshot is a string — the names joined — because a store's snapshot
 * has to be the same *value* when nothing changed, and a fresh `Set` never
 * is. A field name matches `^[a-z][a-z0-9_]*$` on write, so a comma cannot
 * appear in one.
 */
export function useHiddenFields(watch: FormWatch, fields: FormField[]): ReadonlySet<string> {
  const conditional = fields.some((field) => field.show_if);
  const initial = useMemo(() => (conditional ? hiddenNames(fields, blankValue).join(",") : ""), [conditional, fields]);

  const key = useSyncExternalStore(
    watch.subscribe,
    () => {
      if (!conditional) return "";
      const form = watch.form();
      return form ? hiddenNames(fields, (field) => readField(form, field)).join(",") : initial;
    },
    () => initial,
  );

  return useMemo(() => new Set(key ? key.split(",") : []), [key]);
}
