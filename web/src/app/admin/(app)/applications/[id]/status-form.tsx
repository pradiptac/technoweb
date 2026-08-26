"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Select, Textarea } from "@/components/ui/input";
import { setStatusAction, deleteApplicationAction, type ApplicationState } from "../actions";
import type { AdminJobApplication } from "@/types/api";

const initial: ApplicationState = {};

const STATUSES = [
  ["new", "New"], ["shortlisted", "Shortlisted"], ["interviewing", "Interviewing"],
  ["offered", "Offered"], ["hired", "Hired"], ["rejected", "Not proceeding"],
];

export function StatusForm({ application }: { application: AdminJobApplication }) {
  const [state, formAction, pending] = useActionState(setStatusAction, initial);

  return (
    <>
      <form action={formAction}>
        {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

        <input type="hidden" name="id" value={application.id} />

        <Field label="Status" htmlFor="status" variant="above">
          <Select id="status" name="status" defaultValue={application.status}>
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>

        <Field
          label="Note"
          htmlFor="note"
          hint="For colleagues. The candidate never sees this."
          variant="above"
        >
          <Textarea id="note" name="note" rows={3} defaultValue={application.status_note ?? ""} />
        </Field>

        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save status"}
        </Button>
      </form>

      {/*
        Separate form, not a second button in the one above: a delete that
        shares a form with a save is one stray Enter away from happening by
        accident, and this one takes a CV with it.
      */}
      <form
        action={deleteApplicationAction}
        className="mt-5 border-t border-line pt-4"
        onSubmit={(e) => {
          if (!window.confirm(
            `Delete ${application.name}'s application? The CV is deleted with it and neither can be recovered.`,
          )) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={application.id} />
        <button type="submit" className="text-[13px] font-semibold text-err hover:underline">
          Delete this application and its CV
        </button>
        <p className="mt-1 text-[12px] text-faint">
          Use this when somebody asks to have their details removed.
        </p>
      </form>
    </>
  );
}
