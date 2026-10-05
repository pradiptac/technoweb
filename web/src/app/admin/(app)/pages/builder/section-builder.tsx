"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { MoveButton, ReorderButtons } from "@/components/admin/reorder-buttons";
import { IconChevronDown, IconEye, IconEyeOff, IconLayers } from "@/components/icons-ui";
import { Badge } from "@/components/ui/badge";
import { Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { SECTION_REVEALS } from "@/lib/motion-choices";
import { cn } from "@/lib/utils";
import type { SectionBackground } from "@/themes/options";
import type { PageBuilderOptions, PageSectionType, SectionPreset, StoredSection } from "@/types/api";
import { BlockEditorProvider, setIn, type Json, type Obj, type Path } from "../../blocks/editors/shared";
import { BackgroundField } from "./background-field";
import { StyleField } from "./style-field";
import { PreviewDialog } from "./preview-dialog";
import { SectionEditor, blankData, summaryOf } from "./section-editors";

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
const CLIP_KEY = "tw_section_clipboard";
const CLIP_TAG = "tw-section";
const HISTORY = 50;
export function SectionBuilder({ sections, setSections, options, media, errors, pageId }: {
  sections: StoredSection[];
  setSections: Dispatch<SetStateAction<StoredSection[]>>;
  options: PageBuilderOptions;
  media: Record<string, string>;
  errors: Errors;
  pageId: number | null;
}) {
  const toast = useToast();
  const [open, setOpen] = useState<Set<string>>(() => new Set(sections.length <= 3 ? sections.map((s) => s.id) : []));
  const [picking, setPicking] = useState(false);

  /*
   * History. Every change goes through `apply`, which computes the next list
   * from the current one, records the current one, and hands the next to
   * the form. No setState inside another's updater: React may run an
   * updater twice, and a history push in one would record a step twice.
   */
  const [past, setPast] = useState<StoredSection[][]>([]);
  const [future, setFuture] = useState<StoredSection[][]>([]);
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
  }, [past, sections, setSections]);
  const redo = useCallback(() => {
    if (!future.length) return;
    setPast((p) => [...p, sections].slice(-HISTORY));
    setFuture((f) => f.slice(1));
    lastPush.current = { key: "", at: 0 };
    setSections(future[0]);
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
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const drop = (to: number) => {
    if (dragging === null) return;
    const from = dragging;
    setDragging(null);
    setDropAt(null);
    if (to === from || to === from + 1) return;
    apply((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to > from ? to - 1 : to, 0, item);
      return next;
    });
  };

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
    (type: string) => options.section_types.find((t) => t.value === type)?.label ?? type,
    [options.section_types],
  );

  const toggle = (id: string, force?: boolean) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (force ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });

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

  return (
    <div data-section-builder ref={root}>
      {errs.blocks && <p className="mb-3 text-13 text-err">{errs.blocks[0]}</p>}

      {/* The edit bar: history and the clipboard. */}
      <div className="mb-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Builder history">
        <Button type="button" size="sm" variant="ghost" onClick={undo} disabled={!past.length} title="Undo (Ctrl/⌘ Z)">Undo</Button>
        <Button type="button" size="sm" variant="ghost" onClick={redo} disabled={!future.length} title="Redo (Ctrl/⌘ Shift Z)">Redo</Button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <Button type="button" size="sm" variant="ghost" onClick={paste}>Paste a section</Button>
        <span className="ml-auto text-12 text-faint">Drag a section by its handle, or use its arrows.</span>
      </div>

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

      <ol className="grid gap-3" onDragEnd={() => { setDragging(null); setDropAt(null); }}>
        {sections.map((section, i) => (
          <SectionCard
            dragging={dragging === i}
            dropBefore={dropAt === i && dragging !== null && dragging !== i && dragging !== i - 1}
            dropAfter={i === sections.length - 1 && dropAt === sections.length && dragging !== null && dragging !== i}
            onDragStart={() => setDragging(i)}
            onDragOverHalf={(after) => setDropAt(after ? i + 1 : i)}
            onDrop={() => drop(dropAt ?? i)}
            onCopy={() => copy(section)}
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

      <Modal open={picking} onClose={() => setPicking(false)} title="Add a section" size="lg"
        description="Each is a set of fields; the theme decides how it looks.">
        <div className="grid gap-2 sm:grid-cols-2">
          {options.section_types.map((t) => (
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
    </div>
  );
}

function SectionCard({
  section, index, count, label, expanded, errors, options, media, onToggle, onMove, onDuplicate, onHide, onRemove, patch,
  dragging, dropBefore, dropAfter, onDragStart, onDragOverHalf, onDrop, onCopy,
}: {
  dragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  onDragStart: () => void;
  onDragOverHalf: (after: boolean) => void;
  onDrop: () => void;
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
}) {
  const prefix = `blocks.${index}`;
  const mine = Object.entries(errors).filter(([k]) => k === prefix || k.startsWith(`${prefix}.`));
  const bad = mine.length > 0;
  const show = expanded || bad;
  const idPrefix = `s${index}-${section.id.slice(0, 8)}`;
  const bodyId = `${idPrefix}-body`;
  const summary = summaryOf(section.data);
  // Errors no field on the card owns: the id, the type, the data as a whole.
  const stray = mine.filter(([k]) => [`${prefix}.id`, `${prefix}.type`, `${prefix}.data`, prefix].includes(k));

  const set = useCallback(
    (path: Path, value: Json | undefined) => patch(section.id, (s) => ({ ...s, data: setIn(s.data as Obj, path, value) as Obj })),
    [patch, section.id],
  );
  const err = useCallback((path: Path) => errors[`${prefix}.data.${path.join(".")}`]?.[0], [errors, prefix]);
  const ctx = useMemo(
    () => ({ content: section.data as Obj, set, err, media, brands: [], idPrefix }),
    [section.data, set, err, media, idPrefix],
  );

  return (
    <li
      data-section-card={section.type}
      onDragOver={(e) => {
        e.preventDefault();
        const box = e.currentTarget.getBoundingClientRect();
        onDragOverHalf(e.clientY > box.top + box.height / 2);
      }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
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
          draggable
          onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", section.id); onDragStart(); }}
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
          <BlockEditorProvider value={ctx}>
            <SectionEditor type={section.type} sectionId={section.id} options={options} />
          </BlockEditorProvider>
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
            errors={Object.fromEntries(
              Object.entries(errors)
                .filter(([k]) => k.startsWith(`${prefix}.style.`))
                .map(([k, v]) => [k.slice(`${prefix}.style.`.length).split(".")[0], v[0]]),
            )}
          />
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
