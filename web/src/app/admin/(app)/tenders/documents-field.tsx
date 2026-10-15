"use client";

import { useId, useState } from "react";
import { DocumentField } from "@/components/admin/document-field";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import type { AdminTenderDocument } from "@/lib/admin";

/**
 * The tender pack: a repeater of documents, in the order a bidder should
 * read them (0.174.0, `docs/tenders.md`).
 *
 * Each row posts into three parallel fields of the same name —
 * `document_title`, `document_path`, `document_note` — which the action
 * zips back together **by position before dropping the empty rows**, so a
 * half-filled row cannot shift somebody else's note onto the wrong file.
 *
 * The picker is `DocumentField`, the downloads centre's: it browses the
 * media library and uploads into it in the same dialog, which is what keeps
 * an editor from putting four copies of one tender pack in the library
 * under four hashed names.
 *
 * **Keyed by an id given on arrival, never by the index.** A row keyed by
 * its position loses its React state to the row above it when one is
 * removed — the repeater bug this project has written down three times.
 */

type Row = AdminTenderDocument & { key: string };

const blank = (key: string): Row => ({
  key, title: "", note: null, file_path: "", url: null, size: null, extension: null, missing: false,
});

export function TenderDocumentsField({ documents, max, error }: {
  documents: AdminTenderDocument[];
  max: number;
  /** The API's per-row errors, keyed `documents.0.file_path`. */
  error: (field: string) => string | undefined;
}) {
  const base = useId();
  const [rows, setRows] = useState<Row[]>(() =>
    documents.map((d, i) => ({ ...d, key: `${base}-${i}` })),
  );
  const [next, setNext] = useState(documents.length);

  const add = () => {
    setRows((current) => [...current, blank(`${base}-${next}`)]);
    setNext((n) => n + 1);
  };

  const move = (index: number, delta: -1 | 1) => {
    setRows((current) => {
      const to = index + delta;
      if (to < 0 || to >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[to]] = [copy[to], copy[index]];

      return copy;
    });
  };

  const remove = (index: number) => setRows((current) => current.filter((_, i) => i !== index));

  return (
    <div className="mb-[18px]">
      <p className="mb-1 text-13 font-semibold">Tender documents</p>
      <p className="mb-3 text-12-5 text-muted">
        The notice, the bill of quantities, a corrigendum. Up to {max}. They are files from the media
        library and are public, like the notice itself — anybody may bid.
      </p>

      {rows.length === 0 && (
        <p className="mb-3 rounded-md border border-dashed border-line-strong px-3 py-4 text-13 text-muted">
          No documents yet. A tender can be published without any — some packs are collected in person.
        </p>
      )}

      <ul className="grid gap-4">
        {rows.map((row, index) => (
          <li key={row.key} className="min-w-0 rounded-lg border border-line-strong bg-surface p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-12-5 font-semibold uppercase tracking-wide text-muted">
                Document {index + 1}
              </span>
              <ReorderButtons
                index={index}
                count={rows.length}
                subject={`document ${index + 1}`}
                onMove={(delta) => move(index, delta)}
                onRemove={() => remove(index)}
                dense
              />
            </div>

            {row.missing && (
              <p className="mb-3 rounded-md border border-warn/25 bg-warn-soft px-3 py-2 text-12-5 text-warn">
                The file this row points at is no longer in the media library, so it is not shown on the
                site. Choose another, or remove the row.
              </p>
            )}

            <Field
              label="Name"
              htmlFor={`${row.key}-title`}
              error={error(`documents.${index}.title`)}
              hint="What a bidder sees — “Tender document”, “Bill of quantities”."
            >
              <Input
                id={`${row.key}-title`}
                name="document_title"
                defaultValue={row.title}
                maxLength={160}
                aria-invalid={Boolean(error(`documents.${index}.title`))}
              />
            </Field>

            <DocumentField
              name="document_path"
              label="File"
              hint="Browse the library, or upload it in the dialog."
              defaultPath={row.file_path || null}
              defaultName={row.extension ? `${row.title || "file"}.${row.extension}` : null}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
              error={error(`documents.${index}.file_path`)}
            />

            <Field
              label="Note"
              htmlFor={`${row.key}-note`}
              error={error(`documents.${index}.note`)}
              hint="Optional, one line — “Read this first”, “Corrigendum 1”."
            >
              <Input id={`${row.key}-note`} name="document_note" defaultValue={row.note ?? ""} maxLength={200} />
            </Field>
          </li>
        ))}
      </ul>

      {rows.length < max && (
        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={add}>
          Add a document
        </Button>
      )}
    </div>
  );
}
