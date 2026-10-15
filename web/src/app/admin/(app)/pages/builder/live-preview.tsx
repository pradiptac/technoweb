"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  BUILDER_EDIT, BUILDER_EDITING, BUILDER_FIELDS, BUILDER_READY, BUILDER_SELECT, BUILDER_SHOW,
} from "@/components/page-sections/builder-preview-bridge";
import { inlineValues, isInlinePath, type InlinePath, type InlineSpec } from "@/components/page-sections/inline-fields";
import { cn } from "@/lib/utils";
import type { StoredSection } from "@/types/api";
import { previewSectionsAction } from "./preview-action";

/**
 * The page beside its sections, redrawn as they change (0.112.0,
 * `docs/page-builder.md` "Live preview").
 *
 * Each redraw is the unsaved preview the dialog uses — `previewSectionsAction`
 * runs the save's rules and keeps the presented sections, and a framed
 * `/admin/draft-preview/{id}` draws them with the public components under the
 * active theme — sent about a second after the last change. The new frame
 * loads hidden behind the shown one, takes its scroll position, and only
 * then takes its place, so nothing flashes and the reader keeps their place.
 *
 * **A section still missing what its rules need is left out, not allowed to
 * stop the preview**: on a 422 the sections it names are dropped and the rest
 * drawn, and the pane says which. The builder still marks those fields when
 * the page is saved or the Preview button is pressed.
 *
 * The frame is drawn at the device's width — 1280, 768 or 390 — and scaled
 * to the pane, so a desktop page is seen as a desktop page, smaller.
 *
 * **Edit on the page** (0.128.0, `docs/page-builder.md`). When a frame says
 * it is listening it is sent the plain-text fields **of the draft it drew**
 * (`drawn`, kept per draft id — not the list as it stands now, which may have
 * moved on), and it makes those words editable where it finds them. Each
 * change comes back as `{id, path, value, was}` from the shown frame only and
 * is handed to the builder inside `flushSync` through an Effect Event, so the
 * next keystroke's message meets a builder that has already taken this one —
 * as a prop read by the listener's closure it did not: an effect re-subscribes
 * after the paint, a fast typist's second letter arrived first, was checked
 * against the words before the first, and every letter after it was refused
 * (measured at 25ms a key by the probe). While a field in
 * the frame has focus nothing is redrawn — a swap would take the caret away
 * mid-word — and a frame that finishes loading meanwhile is dropped; the
 * redraw runs when the field is left.
 */
const DEVICES = [
  { id: "desktop", label: "Desktop", width: 1280 },
  { id: "tablet", label: "Tablet", width: 768 },
  { id: "phone", label: "Phone", width: 390 },
] as const;
type DeviceId = (typeof DEVICES)[number]["id"];

const WAIT_MS = 900;
/** The first draw waits a little too, so the editors settling on mount are one request rather than several. */
const FIRST_MS = 600;

export function LivePreview({ sections, pageId, focus, onSelect, inline, onEdit }: {
  sections: StoredSection[];
  pageId: number | null;
  /** The API's `inline_fields`: per section type, the plain-text fields edited on the page. */
  inline?: Record<string, InlineSpec[]>;
  /** A field changed on the page: its section, its path, the new words and the words they replace. */
  onEdit: (id: string, path: InlinePath, value: string, was: string) => void;
  /**
   * The section whose card was opened last; the preview scrolls to it. A new
   * object each time, so opening the same card again scrolls again.
   */
  focus: { id: string } | null;
  /** A section pressed in the preview; `quiet` when the press was on words being edited there. */
  onSelect: (id: string, quiet: boolean) => void;
}) {
  const [device, setDevice] = useState<DeviceId>("desktop");
  const [shown, setShown] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pane, setPane] = useState({ w: 0, h: 0 });

  const json = useMemo(() => JSON.stringify(sections), [sections]);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  /** What each draft was drawn from, so a frame is told the fields it actually shows. */
  const drawn = useRef(new Map<string, StoredSection[]>());
  const box = useRef<HTMLDivElement>(null);
  const hasShown = useRef(false);
  const seq = useRef(0);

  // The pane's size, for the scale.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setPane({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Redraw a moment after the last change; a newer change cancels an older answer.
  useEffect(() => {
    const n = ++seq.current;
    // Words are being edited in the frame: the redraw waits until they are left.
    if (editing) return;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      let list: StoredSection[] = JSON.parse(json);
      let result = await previewSectionsAction(JSON.stringify(list), pageId);
      let left: number[] = [];

      if (!result.id && result.fieldErrors) {
        const bad = new Set(Object.keys(result.fieldErrors).map((k) => Number(/^blocks\.(\d+)/.exec(k)?.[1])).filter((i) => !Number.isNaN(i)));
        left = [...bad].sort((a, b) => a - b);
        list = list.filter((_, i) => !bad.has(i));
        result = list.length ? await previewSectionsAction(JSON.stringify(list), pageId) : { error: "Fill in a section to see it here." };
      }
      if (n !== seq.current) return;
      setBusy(false);

      if (result.id) {
        drawn.current.set(result.id, list);
        setNext(result.id);
        setNote(left.length
          ? `Section${left.length === 1 ? "" : "s"} ${left.map((i) => i + 1).join(", ")} ${left.length === 1 ? "is" : "are"} left out until ${left.length === 1 ? "its" : "their"} required fields are filled in.`
          : null);
      } else {
        setNote(result.error ?? "The preview could not be drawn.");
      }
    }, hasShown.current ? WAIT_MS : FIRST_MS);

    return () => window.clearTimeout(timer);
  }, [json, pageId, editing]);

  // Read at the moment of the message, never from the listener's closure.
  const edit = useEffectEvent(onEdit);
  const select = useEffectEvent(onSelect);

  // What a frame says: it is listening, a section was pressed, words were edited.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; id?: unknown; quiet?: unknown; active?: unknown; path?: unknown; value?: unknown; was?: unknown } | null;
      const from = [...frames.current].find(([, el]) => el.contentWindow === e.source)?.[0];
      if (!data || !from) return;

      if (data.type === BUILDER_READY) {
        const list = drawn.current.get(from) ?? [];
        e.source?.postMessage({
          type: BUILDER_FIELDS,
          sections: list.map((s) => ({ id: s.id, fields: inlineValues(s.data, inline?.[s.type]) })).filter((s) => s.fields.length > 0),
        }, { targetOrigin: window.location.origin });
        return;
      }

      // Only the page on show is acted on; the one loading behind it is not being used.
      if (from !== shown) return;
      if (data.type === BUILDER_SELECT && typeof data.id === "string") select(data.id, data.quiet === true);
      if (data.type === BUILDER_EDITING) setEditing(data.active === true);
      if (data.type === BUILDER_EDIT && typeof data.id === "string" && isInlinePath(data.path)
        && typeof data.value === "string" && typeof data.was === "string") {
        const { id, path, value, was } = data as { id: string; path: InlinePath; value: string; was: string };
        flushSync(() => edit(id, path, value, was));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [inline, shown]);

  // Scroll the shown frame to the section being edited.
  useEffect(() => {
    if (!focus || !shown) return;
    frames.current.get(shown)?.contentWindow?.postMessage({ type: BUILDER_SHOW, id: focus.id }, window.location.origin);
  }, [focus, shown]);

  // The hidden frame has loaded: give it the shown one's place in the page, then swap.
  const loaded = (id: string) => {
    if (id !== next) return;
    // Swapping now would take the caret out of the words being edited; this
    // draft is already out of date, and the redraw runs when they are left.
    if (editing) {
      setNext(null);
      return;
    }
    const from = shown ? frames.current.get(shown)?.contentWindow : null;
    const to = frames.current.get(id)?.contentWindow;
    if (from && to) to.scrollTo(0, from.scrollY);
    hasShown.current = true;
    for (const key of drawn.current.keys()) if (key !== id) drawn.current.delete(key);
    setShown(id);
    setNext(null);
  };

  const spec = DEVICES.find((d) => d.id === device) ?? DEVICES[0];
  const scale = pane.w > 0 ? Math.min(1, pane.w / spec.width) : 1;
  const left = Math.max(0, (pane.w - spec.width * scale) / 2);

  return (
    <aside aria-label="Live preview" className="sticky top-20 flex h-[calc(100dvh-11rem)] min-w-0 flex-col rounded-lg border border-line-strong bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <span className="text-13-5 font-semibold">Live preview</span>
        <span aria-live="polite" className="text-12 text-faint">
          {editing ? "Editing on the page — it redraws when you finish" : busy ? "Updating…" : shown ? "Up to date" : ""}
        </span>
        <div role="group" aria-label="Width" className="ml-auto flex rounded-md border border-line-strong p-0.5">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={device === d.id}
              onClick={() => setDevice(d.id)}
              className={cn("min-h-7 rounded px-2.5 text-12 font-semibold", device === d.id ? "bg-brand-600 text-brand-on" : "text-muted hover:text-ink")}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      {note && <p className="border-b border-line bg-surface px-3 py-2 text-12-5 text-muted">{note}</p>}
      {shown && inline && (
        <p className="border-b border-line px-3 py-1.5 text-12 text-faint">
          Press a heading, a line of text or a button’s wording to change it here. Enter finishes; Escape puts it back.
        </p>
      )}
      <div ref={box} className="relative min-h-0 flex-1 overflow-hidden bg-surface-2">
        {!shown && !next && <p className="p-6 text-center text-13 text-muted">{note ? "" : "Drawing the page…"}</p>}
        {[shown, next].filter((id): id is string => Boolean(id)).map((id) => (
          <iframe
            key={id}
            ref={(el) => { if (el) frames.current.set(id, el); else frames.current.delete(id); }}
            src={`/admin/draft-preview/${id}`}
            title={id === shown ? "The page as it stands, not saved" : "The next version of the preview, loading"}
            tabIndex={id === shown ? 0 : -1}
            aria-hidden={id === shown ? undefined : true}
            onLoad={() => loaded(id)}
            className={cn("absolute top-0 origin-top-left border-0 bg-page", id === shown ? "visible" : "invisible")}
            style={{ width: spec.width, height: pane.h / scale, left, transform: `scale(${scale})` }}
          />
        ))}
      </div>
    </aside>
  );
}
