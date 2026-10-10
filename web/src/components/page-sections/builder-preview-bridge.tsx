"use client";

import { useEffect } from "react";
import { isInlinePath, type InlineValue } from "./inline-fields";

/** Messages between the builder and the preview it frames — same origin only. */
export const BUILDER_SELECT = "tw:builder-select";
export const BUILDER_SHOW = "tw:builder-show";
/** The frame is listening (frame → builder); the builder answers with `BUILDER_FIELDS`. */
export const BUILDER_READY = "tw:builder-ready";
/** The fields of this draft that may be edited in place (builder → frame). */
export const BUILDER_FIELDS = "tw:builder-fields";
/** A field changed on the page (frame → builder). */
export const BUILDER_EDIT = "tw:builder-edit";
/** A field on the page took or lost focus (frame → builder), so the redraw can wait. */
export const BUILDER_EDITING = "tw:builder-editing";

type Mark = { id: string; field: InlineValue; last: string };

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Where a press means something already — or where the words are not for reading. */
const NOT_HERE = "button, summary, select, textarea, input, label, [role='tab'], [aria-hidden='true'], .sr-only, [contenteditable]";
/** What may sit inside an editable run of words: the heading's word spans, emphasis. Never a glyph or a picture. */
const WORDS_ONLY = new Set(["SPAN", "EM", "STRONG", "B", "I", "U", "S", "MARK", "SMALL"]);

/**
 * The live preview's half of the conversation with the builder (0.112.0,
 * `docs/page-builder.md` "Live preview").
 *
 * Only while framed: a press anywhere in a section (`[data-builder-id]`, put
 * there by `PageSections marked`) tells the parent which section it was, and
 * nothing in the preview navigates or submits — a link pressed there would
 * take the frame somewhere the builder cannot follow. The parent asks for a
 * section by id and the preview scrolls to it and outlines it for a moment.
 * Every message is checked for this origin and, inbound, for the parent as
 * its source.
 *
 * **Edit on the page** (0.128.0). The builder sends, for the draft this frame
 * drew, each section's plain-text fields with their values. A field is found
 * on the page **by its words**: the innermost element inside that section
 * whose whole text is exactly the field's value. No section component knows —
 * which is what lets all thirty types, and every theme's redrawing of them,
 * take part without a prop threaded through each. Where the match is not
 * certain the field is simply left to its card: the same words in two fields
 * but not in two places, words inside a button or a FAQ's summary (a press
 * there already means something), a run of text holding a glyph. What is
 * found becomes `contenteditable` — plain text only, one line (Enter
 * finishes, Escape puts back what was there), cut at the field's length —
 * and each change is posted with the value it replaces, so the builder can
 * refuse an edit made against a draft it has since moved on from.
 */
export function BuilderPreviewBridge() {
  useEffect(() => {
    if (window.parent === window) return;
    const html = document.documentElement;
    const origin = window.location.origin;
    html.setAttribute("data-builder-preview", "");

    const marks = new Map<HTMLElement, Mark>();
    const post = (message: Record<string, unknown>) => window.parent.postMessage(message, origin);
    const marked = (target: EventTarget | null) => {
      const el = target instanceof Element ? target.closest<HTMLElement>("[data-edit]") : null;
      return el && marks.has(el) ? el : null;
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target.closest("[data-builder-id]") : null;
      // A button that only works here (a tab, a slider arrow) keeps working; a link or a submit does not.
      if (e.target instanceof Element && e.target.closest("a[href], button[type='submit'], input[type='submit']")) e.preventDefault();
      const id = target?.getAttribute("data-builder-id");
      // A press on editable words opens the card too, but must not take the focus the words just took.
      if (id) post({ type: BUILDER_SELECT, id, quiet: marked(e.target) !== null });
      // A tab, a slide or an accordion may just have shown words that were not drawn before.
      if (!marked(e.target)) again(400);
    };
    const onSubmit = (e: Event) => e.preventDefault();

    /* ---- edit on the page */

    let fields: { id: string; fields: InlineValue[] }[] = [];
    let active: HTMLElement | null = null;
    let start = "";

    const mark = (el: HTMLElement, id: string, field: InlineValue) => {
      el.setAttribute("data-edit", "");
      el.setAttribute("contenteditable", "plaintext-only");
      // A browser without plaintext-only: editable all the same, and only its text is ever read.
      if (el.contentEditable !== "plaintext-only") el.setAttribute("contenteditable", "true");
      // A link is otherwise dragged as a link when its words are selected.
      if (el.tagName === "A") el.setAttribute("draggable", "false");
      marks.set(el, { id, field, last: field.value });
    };

    let settle: number | undefined;
    const again = (ms: number) => { window.clearTimeout(settle); settle = window.setTimeout(() => stamp(), ms); };

    const stamp = () => {
      if (active) return;
      for (const el of marks.keys()) {
        for (const name of ["data-edit", "contenteditable"]) el.removeAttribute(name);
      }
      marks.clear();

      for (const section of fields) {
        const page = document.querySelector(`[data-builder-id="${CSS.escape(section.id)}"]`);
        if (!page) continue;

        // A layout widget's words are looked for inside that widget only (0.156.0),
        // so two widgets saying the same thing are two fields in two places and
        // not an ambiguity; every other field is looked for in the section.
        const scopes = new Map<string | undefined, InlineValue[]>();
        for (const field of section.fields) scopes.set(field.scope, [...(scopes.get(field.scope) ?? []), field]);

        for (const [scope, group] of scopes) {
          const root = scope === undefined ? page : page.querySelector(`[data-layout-widget="${CSS.escape(scope)}"]`);
          if (root) stampIn(root, section.id, group);
        }
      }
    };

    const stampIn = (root: Element, id: string, group: InlineValue[]) => {
      const wanted = new Map<string, InlineValue[]>();
      for (const field of group) {
        const key = squash(field.value);
        if (key) wanted.set(key, [...(wanted.get(key) ?? []), field]);
      }

      const found = new Map<string, HTMLElement[]>();
      // The root too: a heading widget is itself the element that holds its words.
      for (const el of [root as HTMLElement, ...root.querySelectorAll<HTMLElement>("*")]) {
        const text = squash(el.textContent ?? "");
        if (!wanted.has(text) || el.closest(NOT_HERE)) continue;
        // The innermost element holding exactly these words, and nothing but words.
        if ([...el.children].some((child) => squash(child.textContent ?? "") === text)) continue;
        if ([...el.querySelectorAll("*")].some((inner) => !WORDS_ONLY.has(inner.tagName))) continue;
        // Drawn at this width: a layout's other copy of the same words is not.
        if (!el.getClientRects().length) continue;
        found.set(text, [...(found.get(text) ?? []), el]);
      }

      for (const [text, list] of wanted) {
        const els = found.get(text) ?? [];
        // One field: every place it is drawn is that field. Several fields
        // with the same words: only when each has exactly one place, in order.
        if (list.length === 1) els.forEach((el) => mark(el, id, list[0]));
        else if (els.length === list.length) els.forEach((el, i) => mark(el, id, list[i]));
      }
    };

    /** What the element says now, as one line. */
    const read = (el: HTMLElement) => (el.textContent ?? "").replace(/[\s ]+/g, " ").replace(/^ /, "");

    const caretToEnd = (el: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    };

    const send = (el: HTMLElement, value: string) => {
      const m = marks.get(el);
      if (!m || value === m.last) return;
      post({ type: BUILDER_EDIT, id: m.id, path: m.field.path, value, was: m.last });
      // The field's own record follows, so finding the words again (a tab
      // pressed, another width) finds them as they now read.
      m.last = m.field.value = value;
    };

    const onFocusIn = (e: FocusEvent) => {
      const el = marked(e.target);
      if (!el) return;
      active = el;
      start = marks.get(el)!.last;
      post({ type: BUILDER_EDITING, active: true });
    };

    const onInput = (e: Event) => {
      const el = marked(e.target);
      const m = el && marks.get(el);
      if (!el || !m) return;
      let value = read(el);
      if (value.length > m.field.max) {
        value = value.slice(0, m.field.max);
        el.textContent = value;
        caretToEnd(el);
      }
      send(el, value);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const el = marked(e.target);
      if (!el) return;
      if (e.key === "Enter") {
        e.preventDefault();
        el.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (read(el) !== start) el.textContent = start;
        send(el, start);
        el.blur();
      }
    };

    const onFocusOut = (e: FocusEvent) => {
      const el = marked(e.target);
      if (!el) return;
      send(el, read(el).trim());
      active = null;
      post({ type: BUILDER_EDITING, active: false });
    };

    // Without plaintext-only, a paste would bring its markup; take its words.
    const onPaste = (e: ClipboardEvent) => {
      const el = marked(e.target);
      if (!el || el.contentEditable === "plaintext-only") return;
      e.preventDefault();
      document.execCommand("insertText", false, squash(e.clipboardData?.getData("text/plain") ?? ""));
    };
    const onDrop = (e: DragEvent) => { if (marked(e.target)) e.preventDefault(); };

    let flash: number | undefined;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== window.parent) return;
      const data = e.data as { type?: string; id?: unknown; sections?: unknown } | null;

      if (data?.type === BUILDER_FIELDS && Array.isArray(data.sections)) {
        fields = (data.sections as { id?: unknown; fields?: unknown }[])
          .filter((s) => typeof s?.id === "string" && Array.isArray(s.fields))
          .map((s) => ({
            id: s.id as string,
            fields: (s.fields as InlineValue[]).filter((f) => isInlinePath(f?.path) && typeof f.value === "string" && Number.isInteger(f.max) && f.max > 0 && (f.scope === undefined || typeof f.scope === "string")),
          }));
        // After the page has finished arriving: a mark on markup React has
        // yet to hydrate would be an attribute it did not render.
        if (document.readyState === "complete") again(150);
        else window.addEventListener("load", () => again(150), { once: true });
        return;
      }

      if (data?.type !== BUILDER_SHOW || typeof data.id !== "string") return;
      const el = document.querySelector(`[data-builder-id="${CSS.escape(data.id)}"]`);
      if (!el) return;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
      document.querySelectorAll("[data-builder-flash]").forEach((n) => n.removeAttribute("data-builder-flash"));
      el.setAttribute("data-builder-flash", "");
      window.clearTimeout(flash);
      flash = window.setTimeout(() => el.removeAttribute("data-builder-flash"), 1400);
    };

    // Another width draws another copy of some words: find them again.
    const onResize = () => again(300);

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("input", onInput);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("drop", onDrop, true);
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", onResize);
    post({ type: BUILDER_READY });

    return () => {
      html.removeAttribute("data-builder-preview");
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("input", onInput);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("drop", onDrop, true);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(flash);
      window.clearTimeout(settle);
    };
  }, []);

  return null;
}
