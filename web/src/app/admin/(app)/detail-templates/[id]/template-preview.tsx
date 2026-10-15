"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { TemplateRecordOption } from "@/lib/admin/detail-templates";
import type { DetailTemplateKind, StoredSection } from "@/types/api";
import { previewTemplateAction, templateRecordsAction } from "../actions";

/**
 * "Preview on a record" (0.161.0): the template as it is typed right now,
 * unsaved, drawn by the public site's own components around one chosen record
 * — a draft included. The record is picked from the kind's first fifty, or
 * found by name. A refusal names what to fix and marks the sections it is
 * about, the way a save's 422 does; nothing is written either way.
 */
export function TemplatePreview({ kind, records, sections, onErrors }: {
  kind: DetailTemplateKind;
  records: TemplateRecordOption[];
  sections: StoredSection[];
  onErrors: (errors: Record<string, string[]> | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(records);
  const [search, setSearch] = useState("");
  const [recordId, setRecordId] = useState<number | null>(records[0]?.id ?? null);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // A search replaces the list after a pause in typing; the first render keeps the fifty it was given.
  useEffect(() => {
    if (!open || search.trim() === "") return;
    const timer = window.setTimeout(async () => {
      const found = await templateRecordsAction(kind.value, search);
      setList(found);
      setRecordId((current) => (found.some((r) => r.id === current) ? current : (found[0]?.id ?? null)));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [open, search, kind.value]);

  const draw = (id: number | null) => {
    if (id === null) return;
    setError(null);
    setDraft(null);
    start(async () => {
      const result = await previewTemplateAction(kind.value, id, JSON.stringify(sections));
      if (result.id) {
        setDraft(result.id);
        onErrors(null);
      } else {
        setError(result.error ?? "The preview could not be drawn.");
        onErrors(result.fieldErrors ?? null);
      }
    });
  };

  const noRecords = list.length === 0;

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => { setOpen(true); draw(recordId); }} disabled={sections.length === 0 || records.length === 0}
        title={records.length === 0 ? `There is no ${kind.noun} to preview on yet.` : undefined}>
        Preview on a {kind.noun}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Preview — not saved" size="xl"
        description={`The template as it is typed, drawn around one ${kind.noun} by the public site’s own components under the active theme.`}>
        <div className="mb-3 grid items-end gap-x-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label={`Find a ${kind.noun}`} htmlFor="template-preview-search" className="mb-0">
            <Input id="template-preview-search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </Field>
          <Field label="Preview on" htmlFor="template-preview-record" variant="float-static" className="mb-0">
            <Select id="template-preview-record" value={recordId === null ? "" : String(recordId)} disabled={noRecords}
              onChange={(e) => setRecordId(e.target.value ? Number(e.target.value) : null)}>
              {noRecords && <option value="">Nothing found</option>}
              {list.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </Select>
          </Field>
          <Button type="button" onClick={() => draw(recordId)} pending={pending} disabled={pending || recordId === null}>Redraw</Button>
        </div>
        {pending && <p className="py-10 text-center text-13-5 text-muted">Drawing the page…</p>}
        {error && !pending && (
          <Alert tone="err" title="Nothing to show yet" dismissible={false}>
            {error} The sections that need attention are marked on the cards.
          </Alert>
        )}
        {/* A framed page rather than JSX from the action: it loads the client code every part needs (lib/admin/preview-drafts.ts). */}
        {!pending && draft && (
          <iframe
            src={`/admin/draft-preview/${draft}`}
            title={`Unsaved preview of the template on a ${kind.noun}`}
            className="block h-[70vh] w-full rounded border border-line bg-page"
          />
        )}
      </Modal>
    </>
  );
}
