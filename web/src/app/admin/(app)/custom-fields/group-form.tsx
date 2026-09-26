"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { FormActions } from "@/components/admin/form-actions";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { FieldBuilder } from "./field-builder";
import { createGroupAction, updateGroupAction, type GroupFormState } from "./actions";
import type { AdminCustomFieldGroup, CustomFieldGroupMeta } from "@/types/api";

const initial: GroupFormState = {};

const GROUPS: TabGroup[] = [
  { id: "group", label: "Group", fields: ["name", "slug", "targets", "placement", "sort_order", "is_active"] },
  { id: "fields", label: "Fields", fields: ["fields"] },
];

/**
 * A custom field group: what it is called, which kinds of record it is
 * attached to, whether the page draws it, and its fields.
 */
export function GroupForm({
  group, meta, saved,
}: {
  group?: AdminCustomFieldGroup;
  meta: CustomFieldGroupMeta;
  saved?: boolean;
}) {
  const editing = Boolean(group);
  const [state, formAction, pending] = useActionState(editing ? updateGroupAction : createGroupAction, initial);

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const rowErr = (prefix: string) =>
    err(prefix) ?? Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith(`${prefix}.`))?.[1]?.[0];

  // Every per-field message, numbered, so a 422 on field 4's key is visible
  // above a builder that cannot place it under its own input.
  const fieldMessages = Object.entries(state.fieldErrors ?? {})
    .filter(([k]) => k.startsWith("fields."))
    .map(([k, v]) => {
      const n = Number(k.split(".")[1]);
      return `Field ${Number.isInteger(n) ? n + 1 : "?"}: ${v[0]}`;
    });

  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);
  const selected = new Set(group?.targets ?? []);

  return (
    <Form action={formAction} state={state} noValidate>
      {editing && <input type="hidden" name="id" value={group!.id} />}
      {(group?.targets ?? []).map((t) => <input key={t} type="hidden" name="previous_targets" value={t} />)}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">The Fields tab on every record it is attached to now shows these fields.</Alert>
      )}

      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Name" htmlFor="name" error={err("name")}>
              <Input id="name" name="name" defaultValue={group?.name} required aria-invalid={Boolean(err("name"))} />
            </Field>

            <Field label="Slug" htmlFor="slug" error={err("slug")} hint="Leave blank to build one from the name.">
              <Input id="slug" name="slug" defaultValue={group?.slug} className="font-mono text-14" />
            </Field>

            <fieldset className="mb-[18px]">
              <legend className="mb-[7px] text-13-5 font-semibold">Attached to</legend>
              <p className="mb-2.5 text-12-5 text-faint">
                Every record of a ticked kind gains a Fields tab holding these fields.
              </p>
              <ul className="grid gap-1.5 rounded border border-line-strong bg-card p-3 sm:grid-cols-2">
                {meta.targets.map((t) => (
                  <li key={t.value}>
                    <label className="flex items-start gap-2 text-13-5">
                      <input type="checkbox" name="targets" value={t.value} className="mt-[3px]"
                        defaultChecked={selected.has(t.value)} />
                      <span className="min-w-0">{t.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {rowErr("targets") && <p className="mt-1 text-12-5 text-err">{rowErr("targets")}</p>}
            </fieldset>
          </div>

          <aside className="grid content-start gap-0">
            <Field label="On the public page" htmlFor="placement" error={err("placement")} variant="float-static"
              hint={meta.placements.find((p) => p.value === (group?.placement ?? "details"))?.blurb}>
              <Select id="placement" name="placement" defaultValue={group?.placement ?? "details"}>
                {meta.placements.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </Field>

            <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")}
              hint="Lower numbers come first, on the form and on the page.">
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={group?.sort_order ?? 0} />
            </Field>

            <label className="mb-[18px] flex items-start gap-2 text-13-5">
              <input type="checkbox" name="is_active" value="1" className="mt-0.5" defaultChecked={group?.is_active ?? true} />
              <span>
                Switched on
                <span className="mt-0.5 block text-12-5 text-faint">
                  Off, the fields leave every form and page. What was typed into them is kept.
                </span>
              </span>
            </label>
          </aside>
        </div>

        <div>
          {fieldMessages.length > 0 && (
            <Alert tone="err" title="Some fields need attention" dismissible={false}>
              <ul className="list-disc pl-5">{fieldMessages.map((m) => <li key={m}>{m}</li>)}</ul>
            </Alert>
          )}
          <FieldBuilder fields={group?.fields ?? []} kinds={meta.kinds} targets={meta.targets} />
        </div>
      </Tabs>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create group"}
        </Button>
        <Link href="/admin/custom-fields" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
      </FormActions>
    </Form>
  );
}
