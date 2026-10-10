"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { MoveButton, ReorderButtons } from "@/components/admin/reorder-buttons";
import { IconChevronDown, IconEye, IconEyeOff, IconLayers } from "@/components/icons-ui";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { SECTION_REVEALS } from "@/lib/motion-choices";
import { reinsert, useDragReorder } from "@/lib/hooks/use-drag-reorder";
import { REVISION_LOAD_EVENT } from "@/lib/revisions";
import { cn } from "@/lib/utils";
import type { SectionBackground } from "@/themes/options";
import type { PageBuilderOptions, PageSectionType, SectionPreset, StoredSection } from "@/types/api";
import { specFor, type InlinePath } from "@/components/page-sections/inline-fields";
import { BlockEditorProvider, getIn, setIn, type Json, type Obj, type Path } from "../../blocks/editors/shared";
import { BackgroundField } from "./background-field";
import { StyleField } from "./style-field";
import { PreviewDialog } from "./preview-dialog";
import { LivePreview } from "./live-preview";
import { SectionEditor, blankData, summaryOf } from "./section-editors";
import { SectionAssistant } from "./section-assistant";
import { libraryBlocksAction, saveToLibraryAction, sectionsFromBodyAction } from "../library-actions";

type Errors = Record<string, string[]>;

/**
 * The section builder (2026-09-26, `docs/page-builder.md`): a page as a
 * stack of ready sections — add, reorder, duplicate, hide, remove, collapse,
 * preview. **No free-form canvas**, by the client's choice: a section is a
 * set of validated fields, and a stack of them is a page that cannot be laid
 * out into something unreadable.
 *
 * The list lives in the page form's state and posts as one hidden JSON
 * input (`blocks`), so a section collapsed, reordered or removed is a state
 * change — nothing is renamed and nothing is lost by a panel being shut. A
 * 422 comes back keyed `blocks.N.data.field`: the section it names opens,
 * carries an error count, and each field finds its message by path.
 *
 * Removing a section is undoable from its toast, for as long as the toast is
 * up — a section is a lot of typing to lose to one press.
 *
 * **Undo and redo** (0.105.0) cover every change the builder makes: the
 * buttons above the list, and Ctrl/⌘ Z, Ctrl/⌘ Shift Z and Ctrl/⌘ Y while
 * focus is in the builder but not in a text field, which keeps its own
 * native undo. Typing into one section within a second is one step, not one
 * per keystroke. Fifty steps are kept, in memory only — a reload starts
 * fresh, and the form's own draft (`FormDraft`) is what survives that.
 *
 * **Drag a section by its handle** to reorder; the arrows stay for the
 * keyboard and for touch screens, where HTML drag and drop does not fire.
 * **Copy** puts a section on the clipboard (and in this browser's storage,
 * for when the clipboard cannot be read back); **Paste** adds it to any
 * page's builder with a fresh id — the server validates it on save like
 * anything typed.
 */
/*
 * The library (0.106.0, docs/page-builder.md "The library"): Save to library
 * on a section, placed again from "Add a section" either **linked** — stored
 * as `{type: "saved", data: {saved_id}}`, drawn as the library's section, so
 * an edit there reaches every page — or as a **copy**. A linked card shows
 * which library section it is, a link to edit it, and "Make a copy here" to
 * cut the link. Save as template keeps the whole stack; a new page can start
 * from it under "Start from".
 */
/*
 * The live preview (0.112.0, docs/page-builder.md "Live preview"): beside the
 * sections from 1400px wide, where both columns still have room for their
 * fields; below that the Preview button's dialog is the preview. Whether it
 * is shown is this browser's choice, kept in localStorage and read through
 * `useSyncExternalStore` (server snapshot: off), so the server's markup and
 * the first client render agree.
 */
const LIVE_KEY = "tw_builder_live";
const LIVE_EVENT = "tw:builder-live";
const WIDE = "(min-width: 1400px)";
const subscribeLive = (fn: () => void) => {
  window.addEventListener("storage", fn);
  window.addEventListener(LIVE_EVENT, fn);
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", fn);
  return () => {
    window.removeEventListener("storage", fn);
    window.removeEventListener(LIVE_EVENT, fn);
    mq.removeEventListener("change", fn);
  };
};
const livePref = () => {
  try { return localStorage.getItem(LIVE_KEY) !== "0"; } catch { return true; }
};
const liveState = () => `${window.matchMedia(WIDE).matches ? 1 : 0}${livePref() ? 1 : 0}`;
const setLivePref = (on: boolean) => {
  try { localStorage.setItem(LIVE_KEY, on ? "1" : "0"); } catch { /* private window */ }
  window.dispatchEvent(new Event(LIVE_EVENT));
};

const CLIP_KEY = "tw_section_clipboard";
const CLIP_TAG = "tw-section";
const HISTORY = 50;
/** The one list a section drag moves within. */
const SECTIONS = "sections";

export function SectionBuilder({ sections, setSections, options, media, errors, pageId, inLibrary = false, readBody }: {
  sections: StoredSection[];
  setSections: Dispatch<SetStateAction<StoredSection[]>>;
  options: PageBuilderOptions;
  media: Record<string, string>;
  errors: Errors;
  pageId: number | null;
  /** Editing a library item: no Save to library, no Save as template, no library to place from. */
  inLibrary?: boolean;
  /**
   * The page's body as it stands in the form (0.109.0) — what "This page's
   * content" lays out. Read when the builder is drawn and again at the press,
   * because the body editor is uncontrolled.
   */
  readBody?: () => string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState<Set<string>>(() => new Set(sections.length <= 3 ? sections.map((s) => s.id) : []));
  const [picking, setPicking] = useState(false);
  const [library, setLibrary] = useState(options.library?.sections ?? []);
  const [saving, setSaving] = useState<{ kind: "section" | "template"; index?: number } | null>(null);
  const libraryName = useCallback((id: unknown) => library.find((l) => l.id === Number(id))?.name ?? "a library section", [library]);


  /*
   * History. Every change goes through `apply`, which computes the next list
   * from the current one, records the current one, and hands the next to
   * the form. No setState inside another's updater: React may run an
   * updater twice, and a history push in one would record a step twice.
   */
  const [past, setPast] = useState<StoredSection[][]>([]);
  const [future, setFuture] = useState<StoredSection[][]>([]);
  /*
   * Bumped when a section's content is replaced from outside its fields —
   * Undo, Redo, the assistant. The plain fields are controlled and follow by
   * themselves; a rich-text editor reads its value once, so it is keyed on
   * this (`epoch` in the editor context). Until 0.127.0 Undo put a body back
   * in the data while the editor went on showing — and on the next keystroke
   * saving — the words it had.
   */
  const [epoch, setEpoch] = useState(0);
  /*
   * A version put back from the record's history (0.145.0) replaces every
   * section from outside, at once. The rich-text editors are remounted, as
   * for Undo, and the undo steps are dropped: they describe the sections that
   * were just replaced, and stepping into them would half-restore a stranger.
   */
  useEffect(() => {
    const replaced = () => {
      setEpoch((e) => e + 1);
      setPast([]);
      setFuture([]);
    };
    document.addEventListener(REVISION_LOAD_EVENT, replaced);
    return () => document.removeEventListener(REVISION_LOAD_EVENT, replaced);
  }, []);
  const lastPush = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const apply = useCallback(
    (change: (prev: StoredSection[]) => StoredSection[], coalesce?: string) => {
      const next = change(sections);
      if (next === sections) return;
      const now = Date.now();
      const merge = coalesce && lastPush.current.key === coalesce && now - lastPush.current.at < 1000;
      if (!merge) setPast((p) => [...p.slice(-(HISTORY - 1)), sections]);
      lastPush.current = { key: coalesce ?? "", at: now };
      setFuture([]);
      setSections(next);
    },
    [sections, setSections],
  );
  const undo = useCallback(() => {
    if (!past.length) return;
    setFuture((f) => [sections, ...f].slice(0, HISTORY));
    setPast((p) => p.slice(0, -1));
    lastPush.current = { key: "", at: 0 };
    setSections(past[past.length - 1]);
    setEpoch((e) => e + 1);
  }, [past, sections, setSections]);
  const redo = useCallback(() => {
    if (!future.length) return;
    setPast((p) => [...p, sections].slice(-HISTORY));
    setFuture((f) => f.slice(1));
    lastPush.current = { key: "", at: 0 };
    setSections(future[0]);
    setEpoch((e) => e + 1);
  }, [future, sections, setSections]);

  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !root.current?.contains(document.activeElement)) return;
      const el = document.activeElement as HTMLElement | null;
      // A text field keeps its own undo.
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((key === "z" && e.shiftKey) || key === "y") { e.preventDefault(); redo(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  /* Drag and drop: which section is held, and where it would land. */
  const dnd = useDragReorder<StoredSection>({ onMove: (from, to) => apply((prev) => reinsert(prev, from.index, to.index)) });

  /* Copy and paste between pages. */
  const copy = async (section: StoredSection) => {
    const text = JSON.stringify({ [CLIP_TAG]: 1, section });
    try { localStorage.setItem(CLIP_KEY, text); } catch { /* private window */ }
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    toast({ tone: "ok", title: `${labelOf(section.type)} copied`, body: "Open any page's builder and press Paste a section." });
  };
  const readClip = (text: string | null | undefined): StoredSection | null => {
    try {
      const parsed = JSON.parse(text ?? "");
      const s = parsed?.[CLIP_TAG] === 1 ? parsed.section : null;
      if (!s || typeof s !== "object" || !options.section_types.some((t) => t.value === s.type) || typeof s.data !== "object") return null;
      return { id: crypto.randomUUID(), type: s.type, hidden: Boolean(s.hidden), background: s.background ?? null, reveal: s.reveal ?? null, style: s.style ?? null, data: s.data };
    } catch {
      return null;
    }
  };
  const paste = async () => {
    const fromClipboard = await navigator.clipboard?.readText().catch(() => null);
    let section = readClip(fromClipboard);
    if (!section) {
      let stored: string | null = null;
      try { stored = localStorage.getItem(CLIP_KEY); } catch { /* private window */ }
      section = readClip(stored);
    }
    if (!section) {
      toast({ tone: "warn", title: "Nothing to paste", body: "Press Copy on a section first — on this page or another." });
      return;
    }
    apply((prev) => [...prev, section]);
    toggle(section.id, true);
    toast({ tone: "ok", title: `${labelOf(section.type)} pasted at the end` });
  };

  // A preview's refusal shows on the sections like a save's does, until the next save answers.
  const [previewErrors, setPreviewErrors] = useState<Errors | null>(null);
  const [seenErrors, setSeenErrors] = useState(errors);
  if (errors !== seenErrors) {
    setSeenErrors(errors);
    setPreviewErrors(null);
  }
  const errs = previewErrors ?? errors;

  const labelOf = useCallback(
    (type: string) => options.section_types.find((t) => t.value === type)?.label ?? (type === "saved" ? "Saved section" : type),
    [options.section_types],
  );

  /* The live preview, and the section it should be showing. */
  const live = useSyncExternalStore(subscribeLive, liveState, () => "00");
  const wide = live[0] === "1";
  const showLive = wide && live[1] === "1";
  const [focus, setFocus] = useState<{ id: string } | null>(null);

  const toggle = (id: string, force?: boolean) => {
    if (force ?? !open.has(id)) setFocus({ id });
    setOpen((prev) => {
      const next = new Set(prev);
      if (force ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // A section pressed in the preview: open its card and bring it into view.
  // `quiet` is a press on words being edited there, which keep the focus.
  const selectFromPreview = useCallback((id: string, quiet = false) => {
    setOpen((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    window.requestAnimationFrame(() => {
      const card = root.current?.querySelector<HTMLElement>(`[data-section-card-id="${CSS.escape(id)}"]`);
      card?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      if (!quiet) card?.querySelector<HTMLElement>("button[aria-expanded]")?.focus({ preventScroll: true });
    });
  }, []);

  const add = (type: PageSectionType) => {
    const section: StoredSection = { id: crypto.randomUUID(), type, hidden: false, background: null, data: blankData(type) };
    apply((prev) => [...prev, section]);
    toggle(section.id, true);
    setPicking(false);
  };

  const applyPreset = (preset: SectionPreset) => {
    const fresh = preset.sections.map((s) => ({ ...structuredClone(s), id: crypto.randomUUID() }) as StoredSection);
    apply(() => fresh);
    setOpen(new Set(fresh.slice(0, 1).map((s) => s.id)));
  };

  const move = (i: number, delta: -1 | 1) =>
    apply((prev) => {
      const next = [...prev];
      const [item] = next.splice(i, 1);
      next.splice(i + delta, 0, item);
      return next;
    });

  const duplicate = (i: number) => {
    const id = crypto.randomUUID();
    apply((prev) => [...prev.slice(0, i + 1), { ...structuredClone(prev[i]), id }, ...prev.slice(i + 1)]);
    toggle(id, true);
  };

  const toggleHidden = (i: number) =>
    apply((prev) => prev.map((s, j) => (j === i ? { ...s, hidden: !s.hidden } : s)));

  const remove = (i: number) => {
    const removed = sections[i];
    if (!removed) return;
    apply((prev) => prev.filter((s) => s.id !== removed.id));
    toast({
      tone: "info",
      title: `${labelOf(removed.type)} removed`,
      duration: 10_000,
      body: (
        <button
          type="button"
          className="mt-1 rounded border border-current px-2.5 py-0.5 text-12-5 font-semibold hover:bg-card"
          onClick={() => setSections((prev) => (prev.some((s) => s.id === removed.id) ? prev : [...prev.slice(0, i), removed, ...prev.slice(i)]))}
        >
          Undo
        </button>
      ),
    });
  };

  // Typing into one section within a second is one undo step.
  const patch = useCallback(
    (id: string, change: (s: StoredSection) => StoredSection) => apply((prev) => prev.map((s) => (s.id === id ? change(s) : s)), `patch:${id}`),
    [apply],
  );
  // A structural change inside a section (the layout editor's moves): its own step.
  const patchStep = useCallback(
    (id: string, change: (s: StoredSection) => StoredSection) => apply((prev) => prev.map((s) => (s.id === id ? change(s) : s))),
    [apply],
  );

  /*
   * Words edited on the page (0.128.0, docs/page-builder.md "Edit on the
   * page"). The preview is another document, so its message is checked like
   * anything from outside: the path must be one of this type's in-place
   * fields (the API's list), the words one line within the field's length,
   * and `was` what the field holds **now** — an edit made against a draft
   * the builder has since moved on from (a row removed, the field retyped in
   * its card) is dropped rather than written to the wrong place. It goes
   * through `patch`, so it is one undo step with any typing in that section
   * within the second, and an emptied field is stored as the card stores it.
   */
  const editFromPreview = useCallback(
    (id: string, path: InlinePath, value: string, was: string) => {
      const section = sections.find((s) => s.id === id);
      const spec = section && specFor(options.inline_fields?.[section.type], path, section.data);
      if (!section || !spec || value.length > spec.max || /[\r\n]/.test(value)) return;
      const current = getIn(section.data as Obj, path);
      if ((typeof current === "string" ? current : "") !== was) return;
      patch(id, (s) => ({ ...s, data: setIn(s.data as Obj, path, value === "" ? undefined : value) as Obj }));
    },
    [sections, options.inline_fields, patch],
  );

  // The assistant's wording: one history step of its own, never merged with typing.
  const replaceData = useCallback(
    (id: string, data: Record<string, unknown>) => {
      apply((prev) => prev.map((s) => (s.id === id ? { ...s, data } : s)));
      setEpoch((e) => e + 1);
    },
    [apply],
  );

  /* Fresh ids for sections arriving from the library or a template. */
  const fresh = (blocks: StoredSection[]) => blocks.map((b) => ({ ...structuredClone(b), id: crypto.randomUUID() }) as StoredSection);

  const placeLinked = (id: number) => {
    const section: StoredSection = { id: crypto.randomUUID(), type: "saved", hidden: false, background: null, data: { saved_id: id } };
    apply((prev) => [...prev, section]);
    setPicking(false);
  };
  const placeCopy = async (id: number) => {
    const blocks = await libraryBlocksAction(id);
    if (!blocks?.length) { toast({ tone: "err", title: "That library section could not be read" }); return; }
    const copies = fresh(blocks);
    apply((prev) => [...prev, ...copies]);
    copies.forEach((c) => toggle(c.id, true));
    setPicking(false);
  };
  const applyTemplate = async (id: number) => {
    const blocks = await libraryBlocksAction(id);
    if (!blocks?.length) { toast({ tone: "err", title: "That template could not be read" }); return; }
    const copies = fresh(blocks);
    apply(() => copies);
    setOpen(new Set(copies.slice(0, 1).map((s) => s.id)));
  };
  /*
   * "This page's content" (0.109.0): the body the page already has — written
   * in the editor, or imported — laid out as sections split at its headings
   * by the API, or kept whole as one text section. Through `apply`, so Undo
   * puts the empty builder back.
   */
  const [bodyHtml] = useState(() => readBody?.() ?? "");
  const hasBody = bodyHtml.replace(/<[^>]*>/g, "").trim() !== "" || /<img\b/i.test(bodyHtml);
  const [laying, setLaying] = useState(false);
  const fromBody = async (whole: boolean) => {
    const body = readBody?.() ?? bodyHtml;
    if (whole) {
      const one: StoredSection = { id: crypto.randomUUID(), type: "rich_text", hidden: false, background: null, data: { body } };
      apply(() => [one]);
      setOpen(new Set([one.id]));
      return;
    }
    setLaying(true);
    const result = await sectionsFromBodyAction(body);
    setLaying(false);
    if (!result.sections?.length) { toast({ tone: "err", title: "The page could not be laid out", body: result.error }); return; }
    apply(() => result.sections!);
    setOpen(new Set(result.sections.slice(0, 1).map((s) => s.id)));
    toast({ tone: "ok", title: `${result.sections.length} section${result.sections.length === 1 ? "" : "s"} from this page’s content` });
  };

  /* "Make a copy here": the library's section, inline, under this card's id. */
  const detach = async (i: number) => {
    const link = sections[i];
    const blocks = await libraryBlocksAction(Number(link?.data.saved_id));
    if (!link || !blocks?.[0]) { toast({ tone: "err", title: "That library section could not be read" }); return; }
    apply((prev) => prev.map((s) => (s.id === link.id ? { ...structuredClone(blocks[0]), id: link.id, hidden: link.hidden } : s)));
    toggle(link.id, true);
  };

  return (
    <div data-section-builder ref={root} className={cn(showLive && "grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start gap-6")}>
      <div className="min-w-0">
      {errs.blocks && <p className="mb-3 text-13 text-err">{errs.blocks[0]}</p>}

      {/* The edit bar: history and the clipboard. */}
      <div className="mb-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Builder history">
        <Button type="button" size="sm" variant="ghost" onClick={undo} disabled={!past.length} title="Undo (Ctrl/⌘ Z)">Undo</Button>
        <Button type="button" size="sm" variant="ghost" onClick={redo} disabled={!future.length} title="Redo (Ctrl/⌘ Shift Z)">Redo</Button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <Button type="button" size="sm" variant="ghost" onClick={paste}>Paste a section</Button>
        {/* A template is a whole page to start from; a record's body area is not one. */}
        {!inLibrary && !options.in_record && <Button type="button" size="sm" variant="ghost" onClick={() => setSaving({ kind: "template" })} disabled={!sections.length}>Save as template</Button>}
        <span className="ml-auto text-12 text-faint">Drag a section by its handle, or use its arrows.</span>
        {wide && (
          <Button type="button" size="sm" variant={showLive ? "secondary" : "ghost"} aria-pressed={showLive} onClick={() => setLivePref(!showLive)}>
            {showLive ? "Hide live preview" : "Show live preview"}
          </Button>
        )}
      </div>

      {sections.length === 0 && hasBody && (
        <section className="mb-6 rounded-lg border border-brand-ink/30 bg-card p-4 sm:p-5">
          <h2 className="mb-1 text-15 font-semibold">This page’s content</h2>
          <p className="measure mb-3 text-13 text-muted">
            The page already has words and pictures. Lay them out as sections — a new one at each main heading — and
            then rearrange them, or keep everything together in one text section.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => fromBody(false)} pending={laying}>Lay it out as sections</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => fromBody(true)} disabled={laying}>Keep it as one text section</Button>
          </div>
        </section>
      )}

      {sections.length === 0 && (options.library?.templates.length ?? 0) > 0 && (
        <section className="mb-6">
          <h2 className="mb-1 text-15 font-semibold">Start from a template</h2>
          <p className="mb-3 text-13 text-muted">A page your team saved — every section is copied, so this page can change without changing it.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {options.library!.templates.map((t) => (
              <button key={t.id} type="button" onClick={() => applyTemplate(t.id)}
                className="flex flex-col gap-1 rounded-lg border border-line-strong bg-card p-4 text-left transition-colors duration-(--duration-base) hover:border-brand-300">
                <span className="text-14 font-semibold">{t.name}</span>
                <span className="text-12-5 text-muted">{t.description || `${t.count} section${t.count === 1 ? "" : "s"}`}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {sections.length === 0 && options.section_presets.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-1 text-15 font-semibold">Start from</h2>
          <p className="mb-3 text-13 text-muted">A starting stack to edit — every word in it is a placeholder. Or add sections one at a time below.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {options.section_presets.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => applyPreset(p)}
                className="flex flex-col gap-1 rounded-lg border border-line-strong bg-card p-4 text-left transition-colors duration-(--duration-base) hover:border-brand-300"
              >
                <span className="text-14 font-semibold">{p.label}</span>
                <span className="text-12-5 text-muted">{p.blurb}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <ol className="grid gap-3">
        {sections.map((section, i) => (
          <SectionCard
            dragging={dnd.dragging(SECTIONS, i)}
            dropBefore={dnd.line(SECTIONS, i)}
            dropAfter={i === sections.length - 1 && dnd.line(SECTIONS, sections.length)}
            handleProps={dnd.handle(SECTIONS, i, section)}
            targetProps={dnd.target(SECTIONS, i)}
            onCopy={() => copy(section)}
            linkedName={section.type === "saved" ? libraryName(section.data.saved_id) : undefined}
            onSaveToLibrary={inLibrary ? undefined : () => setSaving({ kind: "section", index: i })}
            onDetach={() => detach(i)}
            key={section.id}
            section={section}
            index={i}
            count={sections.length}
            label={labelOf(section.type)}
            expanded={open.has(section.id)}
            errors={errs}
            options={options}
            media={media}
            onToggle={() => toggle(section.id)}
            onMove={(d) => move(i, d)}
            onDuplicate={() => duplicate(i)}
            onHide={() => toggleHidden(i)}
            onRemove={() => remove(i)}
            patch={patch}
            patchStep={patchStep}
            epoch={epoch}
            onAssistant={(data) => replaceData(section.id, data)}
            onUndo={undo}
          />
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={() => setPicking(true)}>Add a section</Button>
        <PreviewDialog sections={sections} pageId={pageId} onErrors={setPreviewErrors} />
        {pageId && (
          <Link href={`/admin/pages/${pageId}/preview`} className="py-2 text-13-5 font-semibold text-brand-ink hover:underline">
            Preview the saved page
          </Link>
        )}
      </div>
      </div>

      {showLive && (
        <LivePreview sections={sections} pageId={pageId} focus={focus} onSelect={selectFromPreview}
          inline={options.inline_fields} onEdit={editFromPreview} />
      )}

      <Modal open={picking} onClose={() => setPicking(false)} title="Add a section" size="lg"
        description="Each is a set of fields; the theme decides how it looks.">
        {library.length > 0 && (
          <div className="mb-5">
            <p className="mb-2 text-12-5 font-semibold uppercase tracking-[.08em] text-muted">From your library</p>
            <ul className="grid gap-2">
              {library.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line-strong bg-card p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-14 font-semibold">{l.name}</span>
                    <span className="block text-12 text-muted">{labelOf(l.type ?? "")}</span>
                  </span>
                  <Button type="button" size="sm" onClick={() => placeLinked(l.id)} title="Edits to the library section reach this page">Place linked</Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => placeCopy(l.id)} title="A copy this page owns">Place a copy</Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {options.section_types.filter((t) => t.value !== "saved").map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => add(t.value)}
              className="flex flex-col gap-1 rounded-lg border border-line-strong bg-card p-3.5 text-left transition-colors duration-(--duration-base) hover:border-brand-300"
            >
              <span className="text-14 font-semibold">{t.label}</span>
              <span className="text-12-5 text-muted">{t.blurb}</span>
            </button>
          ))}
        </div>
      </Modal>

      <SaveToLibrary
        saving={saving}
        label={saving?.kind === "section" && saving.index !== undefined ? labelOf(sections[saving.index]?.type ?? "") : ""}
        onClose={() => setSaving(null)}
        onSave={async (name, description, link) => {
          if (!saving) return null;
          const blocks = saving.kind === "section" && saving.index !== undefined ? [sections[saving.index]] : sections;
          const result = await saveToLibraryAction({ kind: saving.kind, name, description: description || null, blocks });
          if (!result.ok || !result.id) return result.error ?? "It could not be saved.";
          if (saving.kind === "section") {
            setLibrary((l) => [...l, { id: result.id!, name, type: blocks[0]?.type ?? null }]);
            const at = saving.index!;
            if (link) {
              apply((prev) => prev.map((s, j) => (j === at ? { id: s.id, type: "saved", hidden: s.hidden, background: null, data: { saved_id: result.id } } : s)));
            }
          }
          toast({ tone: "ok", title: saving.kind === "template" ? `Template “${name}” saved` : `“${name}” saved to the library` });
          setSaving(null);
          return null;
        }}
      />
    </div>
  );
}

/** Name a section or the whole page for the library. */
function SaveToLibrary({ saving, label, onClose, onSave }: {
  saving: { kind: "section" | "template"; index?: number } | null;
  label: string;
  onClose: () => void;
  onSave: (name: string, description: string, link: boolean) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const template = saving?.kind === "template";

  return (
    <Modal open={saving !== null} onClose={() => { setError(null); onClose(); }} size="md"
      title={template ? "Save as a page template" : `Save this ${label.toLowerCase() || "section"} to the library`}
      description={template
        ? "Every section on this page, kept as a starting point for new pages. A page started from it is a copy."
        : "Place it again on any page from Add a section — linked, so editing it here reaches every page, or as a copy."}>
      <div className="grid gap-1">
        <Field label="Name" htmlFor="library-name" error={error ?? undefined}>
          <Input id="library-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </Field>
        {template && (
          <Field label="Description (optional)" htmlFor="library-description">
            <Input id="library-description" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        )}
        {!template && (
          <label className="mb-4 flex items-start gap-2 text-13-5">
            <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} className="mt-1 size-4 accent-brand-600" />
            <span>Link this section to it, so it changes when the library section does.</span>
          </label>
        )}
        <div className="flex gap-2">
          <Button type="button" pending={busy} disabled={!name.trim() || busy} onClick={async () => {
            setBusy(true);
            const problem = await onSave(name.trim(), description.trim(), link);
            setBusy(false);
            setError(problem);
            if (!problem) { setName(""); setDescription(""); }
          }}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

function SectionCard({
  section, index, count, label, expanded, errors, options, media, onToggle, onMove, onDuplicate, onHide, onRemove, patch, patchStep,
  dragging, dropBefore, dropAfter, handleProps, targetProps, onCopy, linkedName, onSaveToLibrary, onDetach,
  epoch, onAssistant, onUndo,
}: {
  epoch: number;
  onAssistant: (data: Record<string, unknown>) => void;
  onUndo: () => void;
  linkedName?: string;
  onSaveToLibrary?: () => void;
  onDetach: () => void;
  dragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  handleProps: ReturnType<ReturnType<typeof useDragReorder>["handle"]>;
  targetProps: ReturnType<ReturnType<typeof useDragReorder>["target"]>;
  onCopy: () => void;
  section: StoredSection;
  index: number;
  count: number;
  label: string;
  expanded: boolean;
  errors: Errors;
  options: PageBuilderOptions;
  media: Record<string, string>;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onHide: () => void;
  onRemove: () => void;
  patch: (id: string, change: (s: StoredSection) => StoredSection) => void;
  patchStep: (id: string, change: (s: StoredSection) => StoredSection) => void;
}) {
  const prefix = `blocks.${index}`;
  const mine = Object.entries(errors).filter(([k]) => k === prefix || k.startsWith(`${prefix}.`));
  const bad = mine.length > 0;
  const show = expanded || bad;
  const idPrefix = `s${index}-${section.id.slice(0, 8)}`;
  const bodyId = `${idPrefix}-body`;
  const linked = section.type === "saved";
  const summary = linked ? (linkedName ?? "") : summaryOf(section.data);
  // Errors no field on the card owns: the id, the type, the data as a whole.
  const stray = mine.filter(([k]) => [`${prefix}.id`, `${prefix}.type`, `${prefix}.data`, prefix].includes(k));

  const set = useCallback(
    (path: Path, value: Json | undefined) => patch(section.id, (s) => ({ ...s, data: setIn(s.data as Obj, path, value) as Obj })),
    [patch, section.id],
  );
  const setStep = useCallback(
    (path: Path, value: Json | undefined) => patchStep(section.id, (s) => ({ ...s, data: setIn(s.data as Obj, path, value) as Obj })),
    [patchStep, section.id],
  );
  const err = useCallback((path: Path) => errors[`${prefix}.data.${path.join(".")}`]?.[0], [errors, prefix]);
  const anyErr = useCallback((path: Path) => {
    const at = `${prefix}.data.${path.join(".")}`;
    return Object.keys(errors).some((k) => k === at || k.startsWith(`${at}.`));
  }, [errors, prefix]);
  const ctx = useMemo(
    () => ({ content: section.data as Obj, set, setStep, err, anyErr, media, brands: [], idPrefix, epoch }),
    [section.data, set, setStep, err, anyErr, media, idPrefix, epoch],
  );
  const assistant = !linked && options.ai_section?.types.includes(section.type) ? options.ai_section : null;

  return (
    <li
      data-section-card={section.type}
      data-section-card-id={section.id}
      {...targetProps}
      className={cn(
        "relative min-w-0 rounded-lg border bg-card transition-opacity duration-(--duration-fast)",
        bad ? "border-err" : "border-line-strong", section.hidden && "opacity-80", dragging && "opacity-50",
      )}
    >
      {/* Where a dragged section will land. */}
      {dropBefore && <span aria-hidden className="absolute inset-x-2 -top-2 h-1 rounded-full bg-brand-500" />}
      {dropAfter && <span aria-hidden className="absolute inset-x-2 -bottom-2 h-1 rounded-full bg-brand-500" />}
      <div className="flex flex-wrap items-center gap-2 p-3">
        <span
          {...handleProps}
          title="Drag to move"
          aria-hidden
          className="hidden cursor-grab touch-none select-none rounded px-1 text-16 leading-none text-faint hover:bg-surface-2 hover:text-ink active:cursor-grabbing sm:block"
        >
          ⠿
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={show}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded py-1 text-left"
        >
          <IconChevronDown className={cn("size-4 shrink-0 text-muted transition-[rotate] duration-(--duration-base)", show ? "rotate-0" : "-rotate-90")} />
          <span className="shrink-0 font-mono text-12 text-faint">{index + 1}</span>
          <span className="shrink-0 text-14 font-semibold">{label}</span>
          {summary && <span className="min-w-0 truncate text-13 text-muted">— {summary}</span>}
        </button>
        {section.hidden && <Badge tone="closed">Hidden</Badge>}
        {bad && <Badge tone="urgent">{mine.length} to fix</Badge>}
        <ReorderButtons index={index} count={count} subject={`section ${index + 1}`} onMove={onMove} onRemove={onRemove} dense>
          <MoveButton label={`Duplicate section ${index + 1}`} onClick={onDuplicate}><IconLayers className="size-3.5" /></MoveButton>
          {!linked && onSaveToLibrary && (
            <MoveButton label={`Save section ${index + 1} to the library`} onClick={onSaveToLibrary}>
              <svg aria-hidden viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-6-4-6 4z" /></svg>
            </MoveButton>
          )}
          <MoveButton label={`Copy section ${index + 1} to paste on another page`} onClick={onCopy}>
            <svg aria-hidden viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>
          </MoveButton>
          <MoveButton label={section.hidden ? `Show section ${index + 1}` : `Hide section ${index + 1}`} onClick={onHide}>
            {section.hidden ? <IconEyeOff className="size-3.5" /> : <IconEye className="size-3.5" />}
          </MoveButton>
        </ReorderButtons>
      </div>

      {show && (
        <div id={bodyId} className="border-t border-line p-4">
          {stray.length > 0 && (
            <ul className="mb-3 list-disc pl-5 text-12-5 text-err">
              {stray.map(([k, v]) => <li key={k}>{v[0]}</li>)}
            </ul>
          )}
          {section.hidden && (
            <p className="mb-3 text-12-5 text-faint">Hidden: kept with the page and left off the public site.</p>
          )}
          {linked ? (
            /* A linked library section: what it is, where to change it, and the way out. */
            <div className="rounded-lg border border-brand-ink/25 bg-brand-50 p-4">
              <p className="text-13-5 text-ink">
                Linked to <strong>{linkedName}</strong> in the section library. Its words, style and background come
                from there, so an edit to it reaches every page that places it.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/admin/pages/library/${String(section.data.saved_id)}`} className="inline-flex min-h-9 items-center rounded-md border border-line-strong bg-card px-3 text-13 font-semibold text-brand-ink hover:border-brand-300">
                  Edit it in the library
                </Link>
                <Button type="button" size="sm" variant="secondary" onClick={onDetach}>Make a copy here</Button>
              </div>
              {errors[`${prefix}.data.saved_id`] && <p className="mt-2 text-12-5 text-err">{errors[`${prefix}.data.saved_id`][0]}</p>}
            </div>
          ) : (
          <>
          {assistant && (
            <SectionAssistant options={assistant} type={section.type} data={section.data} idPrefix={idPrefix} onApply={onAssistant} onUndo={onUndo} />
          )}
          <BlockEditorProvider value={ctx}>
            <SectionEditor type={section.type} sectionId={section.id} options={options} />
          </BlockEditorProvider>
          </>
          )}
          {!linked && (<>
          <RevealField
            id={`${idPrefix}-reveal`}
            value={section.reveal ?? null}
            opening={index === 0 && section.type === "hero"}
            error={errors[`${prefix}.reveal`]?.[0]}
            onChange={(reveal) => patch(section.id, (s) => ({ ...s, reveal }))}
          />
          <BackgroundField
            value={section.background}
            onChange={(bg: SectionBackground | null) => patch(section.id, (s) => ({ ...s, background: bg }))}
            error={errors[`${prefix}.background`]?.[0]}
            idPrefix={idPrefix}
            media={media}
          />
          <StyleField
            value={section.style}
            onChange={(style) => patch(section.id, (s) => ({ ...s, style }))}
            idPrefix={idPrefix}
            sectionType={section.type}
            headingColorExcept={options.style_options?.heading_color_except ?? []}
            errors={Object.fromEntries(
              Object.entries(errors)
                .filter(([k]) => k.startsWith(`${prefix}.style.`))
                .map(([k, v]) => {
                  // A per-device error keeps its dotted path (responsive.phone.pad_top); the rest are keyed by their first part.
                  const rest = k.slice(`${prefix}.style.`.length);
                  return [rest.startsWith("responsive.") ? rest : rest.split(".")[0], v[0]];
                }),
            )}
          />
          </>)}
        </div>
      )}
    </li>
  );
}

/**
 * How the section arrives as the page is scrolled — `SECTION_REVEALS`, the
 * frontend's one list. "Default" is what the type does on its own and is
 * stored as nothing; the site-wide Motion style still shapes whichever is
 * chosen, and visitors who ask for less motion get none of it.
 */
function RevealField({ id, value, opening, error, onChange }: {
  id: string;
  value: string | null;
  opening: boolean;
  error?: string;
  onChange: (next: string | null) => void;
}) {
  const current = value ?? "default";
  const hint = opening
    ? "The opening hero is the first thing painted, so it never animates."
    : SECTION_REVEALS.find((c) => c.id === current)?.note;

  return (
    <Field label="Appear" htmlFor={id} variant="float-static" hint={hint} error={error} className="mt-2 max-w-sm">
      <Select id={id} value={current} disabled={opening} onChange={(e) => onChange(e.target.value === "default" ? null : e.target.value)}>
        {SECTION_REVEALS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </Select>
    </Field>
  );
}
