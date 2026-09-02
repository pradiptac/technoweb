"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  saveQualificationAction, deleteQualificationAction,
  saveLevelAction, deleteLevelAction, type ReferenceState,
} from "../actions";
import type { JobExperienceLevelRow, JobQualificationRow } from "@/types/api";

const initial: ReferenceState = {};

/**
 * A row that can be renamed in place, and deleted when nothing uses it.
 *
 * The delete is hidden rather than disabled when a vacancy still requires the
 * value: the API refuses it anyway, and a button whose only outcome is an error
 * is a button that should not be there. The count beside it says why.
 */
function Row({
  id, name, meta, inUse, saveAction, deleteAction, children,
}: {
  id: number;
  name: string;
  meta: string;
  inUse: number;
  saveAction: (p: ReferenceState, f: FormData) => Promise<ReferenceState>;
  deleteAction: (p: ReferenceState, f: FormData) => Promise<ReferenceState>;
  children?: React.ReactNode;
}) {
  const [saveState, save, saving] = useActionState(saveAction, initial);
  const [delState, remove, removing] = useActionState(deleteAction, initial);

  return (
    <li className="border-b border-line py-3 last:border-b-0">
      {saveState.error && <Alert tone="err" title="Could not save">{saveState.error}</Alert>}
      {delState.error && <Alert tone="err" title="Could not delete">{delState.error}</Alert>}

      <div className="flex flex-wrap items-end gap-2">
        <Form action={save} state={saveState} className="flex flex-1 flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={id} />
          <div className="min-w-[160px] flex-1">
            <label htmlFor={`name-${id}`} className="mb-0.5 block text-[11px] font-semibold text-faint">
              Name
            </label>
            <Input id={`name-${id}`} name="name" defaultValue={name} className="py-1.5 text-[13px]" />
          </div>
          {children}
          <Button type="submit" size="sm" variant="secondary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </Form>

        {inUse > 0 ? (
          <Badge tone="closed">{inUse} in use</Badge>
        ) : (
          <Form action={remove} state={delState}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" size="sm" variant="ghost" disabled={removing}>
              {removing ? "Deleting…" : "Delete"}
            </Button>
          </Form>
        )}
      </div>

      <p className="mt-1 text-[12px] text-faint">{meta}</p>
    </li>
  );
}

function AddForm({
  action, label, children,
}: {
  action: (p: ReferenceState, f: FormData) => Promise<ReferenceState>;
  label: string;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <Form action={formAction} state={state} className="mt-4 rounded border border-line-strong bg-surface-2 p-3">
      {state.error && <Alert tone="err" title="Could not add">{state.error}</Alert>}
      {state.ok && <Alert tone="ok" title="Done">{state.ok}</Alert>}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[160px] flex-1">
          <label htmlFor={`new-${label}`} className="mb-0.5 block text-[11px] font-semibold text-faint">
            {label}
          </label>
          <Input id={`new-${label}`} name="name" className="py-1.5 text-[13px]" />
        </div>
        {children}
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Adding…" : "Add"}</Button>
      </div>
    </Form>
  );
}

export function QualificationList({ rows }: { rows: JobQualificationRow[] }) {
  return (
    <section className="rounded-lg border border-line-strong bg-card p-4">
      <h2 className="admin-title mb-1">Qualifications</h2>
      <p className="mb-3 text-[13px] text-muted">
        What a vacancy will accept. A role can list several — the careers page says any one of them.
      </p>

      <ul>
        {rows.map((q) => (
          <Row
            key={q.id}
            id={q.id}
            name={q.name}
            meta={q.job_count > 0 ? `Required by ${q.job_count} vacancy(s)` : "Not used by any vacancy"}
            inUse={q.job_count}
            saveAction={saveQualificationAction}
            deleteAction={deleteQualificationAction}
          />
        ))}
      </ul>

      <AddForm action={saveQualificationAction} label="New qualification" />
    </section>
  );
}

export function LevelList({ rows }: { rows: JobExperienceLevelRow[] }) {
  return (
    <section className="rounded-lg border border-line-strong bg-card p-4">
      <h2 className="admin-title mb-1">Experience levels</h2>
      <p className="mb-3 text-[13px] text-muted">
        A vacancy picks one. Leave the upper bound blank to mean &ldquo;and above&rdquo;.
      </p>

      <ul>
        {rows.map((l) => (
          <Row
            key={l.id}
            id={l.id}
            name={l.name}
            meta={`${l.range} · ${l.job_count > 0 ? `used by ${l.job_count} vacancy(s)` : "not used"}`}
            inUse={l.job_count}
            saveAction={saveLevelAction}
            deleteAction={deleteLevelAction}
          >
            <div className="w-[74px]">
              <label htmlFor={`min-${l.id}`} className="mb-0.5 block text-[11px] font-semibold text-faint">From</label>
              <Input id={`min-${l.id}`} name="min_years" type="number" min={0} defaultValue={l.min_years} className="py-1.5 text-[13px]" />
            </div>
            <div className="w-[74px]">
              <label htmlFor={`max-${l.id}`} className="mb-0.5 block text-[11px] font-semibold text-faint">To</label>
              <Input id={`max-${l.id}`} name="max_years" type="number" min={0} defaultValue={l.max_years ?? ""} className="py-1.5 text-[13px]" />
            </div>
          </Row>
        ))}
      </ul>

      <AddForm action={saveLevelAction} label="New level">
        <div className="w-[74px]">
          <label htmlFor="new-min" className="mb-0.5 block text-[11px] font-semibold text-faint">From</label>
          <Input id="new-min" name="min_years" type="number" min={0} defaultValue={0} className="py-1.5 text-[13px]" />
        </div>
        <div className="w-[74px]">
          <label htmlFor="new-max" className="mb-0.5 block text-[11px] font-semibold text-faint">To</label>
          <Input id="new-max" name="max_years" type="number" min={0} className="py-1.5 text-[13px]" />
        </div>
      </AddForm>
    </section>
  );
}
