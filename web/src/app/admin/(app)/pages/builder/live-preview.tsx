"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BUILDER_SELECT, BUILDER_SHOW } from "@/components/page-sections/builder-preview-bridge";
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

export function LivePreview({ sections, pageId, focus, onSelect }: {
  sections: StoredSection[];
  pageId: number | null;
  /**
   * The section whose card was opened last; the preview scrolls to it. A new
   * object each time, so opening the same card again scrolls again.
   */
  focus: { id: string } | null;
  /** A section pressed in the preview. */
  onSelect: (id: string) => void;
}) {
  const [device, setDevice] = useState<DeviceId>("desktop");
  const [shown, setShown] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pane, setPane] = useState({ w: 0, h: 0 });

  const json = useMemo(() => JSON.stringify(sections), [sections]);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
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
        setNext(result.id);
        setNote(left.length
          ? `Section${left.length === 1 ? "" : "s"} ${left.map((i) => i + 1).join(", ")} ${left.length === 1 ? "is" : "are"} left out until ${left.length === 1 ? "its" : "their"} required fields are filled in.`
          : null);
      } else {
        setNote(result.error ?? "The preview could not be drawn.");
      }
    }, hasShown.current ? WAIT_MS : FIRST_MS);

    return () => window.clearTimeout(timer);
  }, [json, pageId]);

  // A section pressed in the frame.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; id?: unknown } | null;
      if (data?.type === BUILDER_SELECT && typeof data.id === "string") onSelect(data.id);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onSelect]);

  // Scroll the shown frame to the section being edited.
  useEffect(() => {
    if (!focus || !shown) return;
    frames.current.get(shown)?.contentWindow?.postMessage({ type: BUILDER_SHOW, id: focus.id }, window.location.origin);
  }, [focus, shown]);

  // The hidden frame has loaded: give it the shown one's place in the page, then swap.
  const loaded = (id: string) => {
    if (id !== next) return;
    const from = shown ? frames.current.get(shown)?.contentWindow : null;
    const to = frames.current.get(id)?.contentWindow;
    if (from && to) to.scrollTo(0, from.scrollY);
    hasShown.current = true;
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
        <span aria-live="polite" className="text-12 text-faint">{busy ? "Updating…" : shown ? "Up to date" : ""}</span>
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
