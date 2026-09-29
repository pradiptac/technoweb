"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
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
 */
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
    setSections((prev) => [...prev, section]);
    toggle(section.id, true);
    setPicking(false);
  };

  const applyPreset = (preset: SectionPreset) => {
    const fresh = preset.sections.map((s) => ({ ...structuredClone(s), id: crypto.randomUUID() }) as StoredSection);
    setSections(fresh);
    setOpen(new Set(fresh.slice(0, 1).map((s) => s.id)));
  };

  const move = (i: number, delta: -1 | 1) =>
    setSections((prev) => {
      const next = [...prev];
      const [item] = next.splice(i, 1);
      next.splice(i + delta, 0, item);
      return next;
    });

  const duplicate = (i: number) => {
    const id = crypto.randomUUID();
    setSections((prev) => [...prev.slice(0, i + 1), { ...structuredClone(prev[i]), id }, ...prev.slice(i + 1)]);
    toggle(id, true);
  };

  const toggleHidden = (i: number) =>
    setSections((prev) => prev.map((s, j) => (j === i ? { ...s, hidden: !s.hidden } : s)));

  const remove = (i: number) => {
    const removed = sections[i];
    if (!removed) return;
    setSections((prev) => prev.filter((s) => s.id !== removed.id));
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

  const patch = useCallback(
    (id: string, change: (s: StoredSection) => StoredSection) => setSections((prev) => prev.map((s) => (s.id === id ? change(s) : s))),
    [setSections],
  );

  return (
    <div data-section-builder>
      {errs.blocks && <p className="mb-3 text-13 text-err">{errs.blocks[0]}</p>}

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
}: {
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
      className={cn("min-w-0 rounded-lg border bg-card", bad ? "border-err" : "border-line-strong", section.hidden && "opacity-80")}
    >
      <div className="flex flex-wrap items-center gap-2 p-3">
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
