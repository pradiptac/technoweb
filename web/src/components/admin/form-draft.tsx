"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { formatDate } from "@/lib/dates";

type Draft = { at: string; values: Record<string, string[]> };

const PREFIX = "tw_draft:";
const EVERY_MS = 10_000;

/** What a draft never holds: a file cannot be stored and a password must not be. */
function storable(el: Element): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return false;
  if (el instanceof HTMLInputElement && (el.type === "file" || el.type === "password")) return false;
  return Boolean(el.name);
}

function snapshot(form: HTMLFormElement): Record<string, string[]> {
  const values: Record<string, string[]> = {};
  for (const el of form.elements) {
    if (!storable(el)) continue;
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      values[el.name] ??= [];
      if (el.checked) values[el.name].push(el.value);
    } else if (el instanceof HTMLSelectElement && el.multiple) {
      values[el.name] = [...el.selectedOptions].map((o) => o.value);
    } else {
      values[el.name] ??= [];
      values[el.name].push(el.value);
    }
  }
  return values;
}

/*
 * React owns a controlled input's value, so writing `el.value` directly is
 * overwritten on the next render. The prototype's setter plus an `input`
 * event is what React's own change tracking listens for.
 */
function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function restore(form: HTMLFormElement, values: Record<string, string[]>) {
  for (const [name, list] of Object.entries(values)) {
    const controls = [...form.elements].filter((el): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => storable(el) && el.name === name);
    let i = 0;
    for (const el of controls) {
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
        const want = list.includes(el.value);
        if (el.checked !== want) { el.click(); }
      } else if (el instanceof HTMLSelectElement && el.multiple) {
        for (const o of el.options) o.selected = list.includes(o.value);
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        const v = list[i++];
        if (v !== undefined && el.value !== v) setValue(el, v);
      }
    }
  }
  // The editor field re-keys its Summernote on this, reading the hidden input it just had set.
  form.dispatchEvent(new CustomEvent("tw:draft-restored", { bubbles: true }));
}

/**
 * A draft of the form, kept in `localStorage`, offered back on return.
 *
 * Products, solutions and posts are nine-field, four-tab forms, and a
 * refresh, a crash or a closed tab used to be every field of them. Every
 * ten seconds while something has been typed since the last save, the
 * named controls' values are written under the route's key — never a file,
 * never a password, never to the server, so nothing can be half-saved.
 * Submitting clears it: a refused submit is restored by `Form` itself, and
 * typing on from there writes a fresh one.
 *
 * On return a bar says when the draft was made and offers **Restore** or
 * **Discard**. Restore writes each value back through the prototype setter
 * and an `input` event, so a React-controlled field takes it, and then
 * announces `tw:draft-restored` on the form so `EditorField` can re-key
 * Summernote from the hidden input it carries. What a restore cannot do is
 * *create* a control: a repeater row added and never saved has no field to
 * land in and is the one thing a draft loses. Placed inside the `<Form>`,
 * anywhere; it finds the form it is in.
 */
export function FormDraft() {
  const pathname = usePathname();
  const anchor = useRef<HTMLDivElement>(null);
  const [offer, setOffer] = useState<Draft | null>(null);
  const key = `${PREFIX}${pathname}`;

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;

    // Offer an existing draft that differs from what the form holds now.
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const draft = JSON.parse(raw) as Draft;
        const same = JSON.stringify(draft.values) === JSON.stringify(snapshot(form));
        if (same) localStorage.removeItem(key);
        else queueMicrotask(() => setOffer(draft));
      }
    } catch { /* nothing to offer */ }

    let dirty = false;
    const touched = () => { dirty = true; };
    const save = () => {
      if (!dirty) return;
      dirty = false;
      try { localStorage.setItem(key, JSON.stringify({ at: new Date().toISOString(), values: snapshot(form) } satisfies Draft)); } catch { /* full or blocked */ }
    };
    const submitted = () => { dirty = false; try { localStorage.removeItem(key); } catch { /* fine */ } };
    const onHide = () => { if (document.visibilityState === "hidden") save(); };

    form.addEventListener("input", touched);
    form.addEventListener("change", touched);
    form.addEventListener("submit", submitted);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", save);
    const id = setInterval(save, EVERY_MS);

    return () => {
      form.removeEventListener("input", touched);
      form.removeEventListener("change", touched);
      form.removeEventListener("submit", submitted);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", save);
      clearInterval(id);
    };
  }, [key]);

  const discard = () => { try { localStorage.removeItem(key); } catch { /* fine */ } setOffer(null); };
  const apply = () => {
    const form = anchor.current?.closest("form");
    if (form && offer) restore(form, offer.values);
    setOffer(null);
  };

  return (
    <div ref={anchor} data-form-draft>
      {offer && (
        <Alert tone="info" title={`You were typing here at ${formatDate(offer.at, "dateTime")}.`}>
          <span>Nothing was saved — put it back?</span>
          <span className="ml-3 inline-flex gap-2 align-baseline">
            <button type="button" onClick={apply} className="rounded border border-current px-2.5 py-0.5 text-12-5 font-semibold hover:bg-card">Restore</button>
            <button type="button" onClick={discard} className="rounded px-2 py-0.5 text-12-5 font-medium underline-offset-2 hover:underline">Discard</button>
          </span>
        </Alert>
      )}
    </div>
  );
}
