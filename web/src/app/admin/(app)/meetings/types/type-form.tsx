"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { FormActions } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import {
  createMeetingTypeAction, deleteMeetingTypeAction, updateMeetingTypeAction, type MeetingActionState,
} from "../actions";
import type { AdminMeetingType } from "@/types/meetings";
import { RecordSwitch } from "@/components/admin/record-switch";

const initial: MeetingActionState = {};

/**
 * One form for a new type and an existing one. The host checkboxes are the
 * API's `meta.eligible_hosts`, plus anybody still ticked on the type who is
 * no longer eligible — shown, so unticking them is possible, and marked,
 * because a list of hosts none of whom can host means nobody, never
 * everybody.
 */
export function MeetingTypeForm({
  type, eligible,
}: {
  type?: AdminMeetingType;
  eligible: { id: number; name: string }[];
}) {
  const editing = Boolean(type);
  const [state, formAction, pending] = useActionState(editing ? updateMeetingTypeAction : createMeetingTypeAction, initial);
  const [deleteState, deleteAction, deleting] = useActionState(deleteMeetingTypeAction, initial);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  const ticked = new Set(type?.host_ids ?? []);
  const hosts = [
    ...eligible.map((h) => ({ ...h, eligible: true })),
    ...(type?.hosts ?? []).filter((h) => !eligible.some((e) => e.id === h.id)).map((h) => ({ id: h.id, name: h.name, eligible: false })),
  ];

  return (
    <Form action={formAction} state={state} noValidate>
      {editing && <input type="hidden" name="id" value={type!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {deleteState.error && <Alert tone="err" title="Not deleted">{deleteState.error}</Alert>}

      <div className="grid gap-x-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <Field label="Name" htmlFor="name" error={err("name")} hint="What the booking page calls it — “Product demo”.">
            <Input id="name" name="name" required defaultValue={type?.name} maxLength={120} />
          </Field>

          <Field label="Slug" htmlFor="slug" error={err("slug")} hint="Its address on the booking page, ?type=… Blank makes one from the name.">
            <Input id="slug" name="slug" defaultValue={type?.slug} maxLength={80} pattern="[a-z0-9-]*" />
          </Field>

          <Field label="Description" htmlFor="description" error={err("description")} hint="One or two sentences under the name on the booking page.">
            <Textarea id="description" name="description" rows={3} defaultValue={type?.description ?? ""} maxLength={500} />
          </Field>

          <div className="grid gap-x-5 sm:grid-cols-3">
            <Field label="Length (minutes)" htmlFor="minutes" variant="float-static" error={err("minutes")}>
              <Input id="minutes" name="minutes" type="number" min={15} max={240} step={5} required defaultValue={type?.minutes ?? 30} />
            </Field>
            <Field label="Free before (minutes)" htmlFor="buffer_before" variant="float-static" error={err("buffer_before")}>
              <Input id="buffer_before" name="buffer_before" type="number" min={0} max={120} step={5} defaultValue={type?.buffer_before ?? 0} />
            </Field>
            <Field label="Free after (minutes)" htmlFor="buffer_after" variant="float-static" error={err("buffer_after")}>
              <Input id="buffer_after" name="buffer_after" type="number" min={0} max={120} step={5} defaultValue={type?.buffer_after ?? 0} />
            </Field>
          </div>
          <p className="-mt-3 mb-[18px] text-12-5 text-muted">
            The buffers keep the host free either side, so calls are never back to back. A change applies to meetings booked from now on.
          </p>

          <fieldset className="mb-[18px]">
            <legend className="mb-[7px] block text-13-5 font-semibold">Who may host it</legend>
            <p className="mb-3 text-12-5 text-faint">
              Tick none and every host may take it. A host is a staff account with the Meeting host role —{" "}
              <Link href="/admin/users" className="text-brand-ink underline">Staff</Link>.
            </p>
            {(err("host_ids") || err("host_ids.0")) && <p className="mb-2 text-12-5 text-err">{err("host_ids") ?? err("host_ids.0")}</p>}
            {hosts.length === 0 ? (
              <p className="text-13 text-muted">Nobody holds the Meeting host role yet, so nobody can be booked.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {hosts.map((h) => (
                  <li key={h.id}>
                    <label className="flex h-full cursor-pointer gap-2.5 rounded border border-line-strong bg-card p-3 hover:border-faint">
                      <input
                        type="checkbox" name="host_ids" value={h.id} defaultChecked={ticked.has(h.id)}
                        className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-13-5 font-semibold">{h.name}</span>
                        {!h.eligible && <span className="block text-12-5 text-err">Can no longer host</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        </div>

        <aside className="grid content-start gap-0">
          <RecordSwitch className="mb-[18px]" name="is_active" defaultChecked={type?.is_active !== false} label="Switched on"
            hint="Off takes it off the booking page and the scheduler. Its meetings stay as they are." />
          <RecordSwitch className="mb-[18px]" name="is_public" defaultChecked={type?.is_public !== false} label="Offered on the website"
            hint="Off keeps it to bookings made here in the console." />
          <Field label="Order" htmlFor="sort_order" variant="float-static" error={err("sort_order")} hint="Lower comes first on the booking page.">
            <Input id="sort_order" name="sort_order" type="number" min={0} max={9999} defaultValue={type?.sort_order ?? 0} />
          </Field>
          {editing && (
            <p className="text-12-5 text-muted">
              {type!.meetings_count === 0 ? "No meetings yet." : `${type!.meetings_count} meeting${type!.meetings_count === 1 ? "" : "s"} booked as this type.`}
            </p>
          )}
        </aside>
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Create type"}</Button>
        <Link href="/admin/meetings/types" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
        {editing && (
          <span className="ml-auto">
            <Button
              type="submit" variant="destructive" size="sm" formAction={deleteAction} formNoValidate pending={deleting}
              onClick={(e) => {
                if (!window.confirm(`Delete ${type!.name}? A type with meetings cannot be deleted — switch it off instead.`)) e.preventDefault();
              }}
            >
              Delete type
            </Button>
          </span>
        )}
      </FormActions>
    </Form>
  );
}
