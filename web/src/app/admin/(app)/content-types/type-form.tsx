"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormActions } from "@/components/admin/form-actions";
import { IconField } from "@/components/admin/icon-field-lazy";
import { createTypeAction, deleteTypeAction, updateTypeAction, type TypeFormState } from "./actions";
import type { AdminContentType, ContentTypeMeta } from "@/types/api";
import { RecordSwitch } from "@/components/admin/record-switch";

const initial: TypeFormState = {};

/**
 * A custom content type: its names, its address, what its entries carry and
 * how its archive lists them.
 *
 * The address is the part with consequences — it is the first segment of
 * every entry's URL — and the hint says what changing it does: a redirect per
 * entry, written by the API.
 */
export function TypeForm({
  type, meta, saved,
}: {
  type?: AdminContentType;
  meta: ContentTypeMeta;
  saved?: boolean;
}) {
  const editing = Boolean(type);
  const [state, formAction, pending] = useActionState(editing ? updateTypeAction : createTypeAction, initial);
  const [deleteState, deleteAction, deleting] = useActionState(deleteTypeAction, initial);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  const check = (name: string, label: string, hint: string, on: boolean) => (
    <RecordSwitch className="mb-[18px]" name={name} defaultChecked={on} label={label} hint={hint} />
  );

  return (
    <>
      <Form action={formAction} state={state} noValidate>
        {editing && <input type="hidden" name="id" value={type!.id} />}
        {editing && <input type="hidden" name="previous_slug" value={type!.slug} />}

        {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
        {deleteState.error && <Alert tone="err" title="Could not delete">{deleteState.error}</Alert>}
        {saved && !state.error && (
          <Alert tone="ok" title="Saved">
            {type?.is_active
              ? <>Its entries live under <Link className="underline" href={type.path}>{type.path}</Link>.</>
              : "Saved, and switched off — nothing of it is on the public site."}
          </Alert>
        )}

        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <div className="grid gap-x-6 sm:grid-cols-2">
              <Field label="Name — one of them" htmlFor="name" error={err("name")} hint="Event, Download, Partner.">
                <Input id="name" name="name" defaultValue={type?.name} required aria-invalid={Boolean(err("name"))} />
              </Field>
              <Field label="Plural" htmlFor="plural" error={err("plural")} hint="The archive's heading: Events.">
                <Input id="plural" name="plural" defaultValue={type?.plural} required aria-invalid={Boolean(err("plural"))} />
              </Field>
            </div>

            <Field label="Address" htmlFor="slug" error={err("slug")}
              hint={editing
                ? "The first part of every entry's URL. Changing it writes a redirect for the archive and for each entry."
                : "The first part of every entry's URL: events gives /events and /events/launch-day. Lowercase letters, numbers and hyphens."}>
              <Input id="slug" name="slug" defaultValue={type?.slug} required className="font-mono text-14"
                aria-invalid={Boolean(err("slug"))} />
            </Field>

            <Field label="Description" htmlFor="description" error={err("description")}
              hint="Shown under the archive's heading. Plain text.">
              <Textarea id="description" name="description" rows={3} defaultValue={type?.description ?? ""} />
            </Field>

            <IconField defaultValue={type?.icon ?? null} error={err("icon")} />

            {check("has_body", "Entries have a body", "A rich-text body under the summary.", type?.has_body ?? true)}
            {check("has_image", "Entries have a picture", "One picture per entry, drawn on its page and its archive tile.", type?.has_image ?? true)}
          </div>

          <aside className="grid content-start gap-0">
            {check("is_active", "Switched on", "Off, the archive and every entry answer 404. Nothing is deleted.", type?.is_active ?? true)}
            {check("archive_enabled", "Has an archive page", "Off, only the entries have pages; the list at the address answers 404.", type?.archive_enabled ?? true)}

            <Field label="Archive order" htmlFor="sort" error={err("sort")} variant="float-static">
              <Select id="sort" name="sort" defaultValue={type?.sort ?? "newest"}>
                {meta.sorts.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>

            <Field label="Entries per archive page" htmlFor="per_page" error={err("per_page")}>
              <Input id="per_page" name="per_page" type="number" min={1} max={60} defaultValue={type?.per_page ?? 12} />
            </Field>

            <Field label="Search engines read an entry as" htmlFor="schema_type" error={err("schema_type")} variant="float-static">
              <Select id="schema_type" name="schema_type" defaultValue={type?.schema_type ?? "Article"}>
                {meta.schema_types.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>

            <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")} hint="Lower comes first in the console.">
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={type?.sort_order ?? 0} />
            </Field>
          </aside>
        </div>

        {editing && (
          <section className="mb-6 rounded-lg border border-line-strong bg-card p-4">
            <h2 className="text-14 font-semibold">Custom fields</h2>
            {(type!.field_groups ?? []).length > 0 ? (
              <p className="mt-1 text-13 text-muted">
                Its entries carry {(type!.field_groups ?? []).map((g) => `${g.name} (${g.fields_count})`).join(", ")}.{" "}
                <Link className="text-brand-ink underline" href={`/admin/custom-fields?target=${encodeURIComponent(type!.target)}`}>Manage</Link>
              </p>
            ) : (
              <p className="mt-1 text-13 text-muted">
                None yet. <Link className="text-brand-ink underline" href="/admin/custom-fields/new">Create a field group</Link>{" "}
                and tick <strong>{type!.plural}</strong> under &ldquo;Attached to&rdquo;.
              </p>
            )}
          </section>
        )}

        <FormActions>
          <Button type="submit" pending={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Create content type"}
          </Button>
          <Link href="/admin/content-types" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
            Cancel
          </Link>
          {editing && (
            <Link href={`/admin/content/${type!.slug}`} className="ml-auto rounded px-3.5 py-2.5 text-13-5 font-semibold text-brand-ink hover:bg-surface-2">
              Its entries ({type!.entries_count ?? 0}) →
            </Link>
          )}
        </FormActions>
      </Form>

      {editing && (
        // Outside the form: a nested form is invalid markup.
        <Form action={deleteAction} state={deleteState} className="mt-10 border-t border-line pt-6">
          <input type="hidden" name="id" value={type!.id} />
          <input type="hidden" name="previous_slug" value={type!.slug} />
          <p className="mb-2 text-13 text-muted">
            A type is deleted only when it holds no entries — delete or move them first, or switch it off instead.
          </p>
          <Button type="submit" variant="ghost" size="sm" className="text-err" pending={deleting}>Delete content type</Button>
        </Form>
      )}
    </>
  );
}
