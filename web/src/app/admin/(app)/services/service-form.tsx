"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { FaqField } from "@/components/admin/faq-field";
import { IconField } from "@/components/admin/icon-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import {
  createServiceAction, updateServiceAction, deleteServiceAction, type ServiceFormState,
} from "./actions";
import type { AdminService } from "@/types/api";

const initial: ServiceFormState = {};

/** Four panels; the field lists map a 422 back to the tab holding it. */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["title", "slug", "summary", "body", "status", "sort_order"] },
  { id: "media", label: "Media", fields: ["icon"] },
  { id: "related", label: "Related", fields: ["faqs"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
];

export function ServiceForm({ service, saved }: { service?: AdminService; saved?: boolean }) {
  const editing = Boolean(service);
  const [state, formAction, pending] = useActionState(
    editing ? updateServiceAction : createServiceAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];
  const rowErr = (prefix: string) =>
    err(prefix) ?? Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith(`${prefix}.`))?.[1]?.[0];

  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  return (
    <form action={formAction} noValidate>
      {editing && <input type="hidden" name="id" value={service!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          {service?.status === "published"
            ? <>Live at <Link className="underline" href={`/services/${service.slug}`}>/services/{service.slug}</Link>.</>
            : "Saved as a draft — it is not on the public site yet."}
        </Alert>
      )}

      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Title" htmlFor="title" error={err("title")}>
              <Input id="title" name="title" defaultValue={service?.title} required aria-invalid={Boolean(err("title"))} />
            </Field>

            <Field label="Slug" htmlFor="slug" error={err("slug")}
              hint={editing
                ? "Changing this leaves a 301 behind automatically, so old links keep working."
                : "Leave blank to build one from the title."}>
              <Input id="slug" name="slug" defaultValue={service?.slug} className="font-mono text-[14px]" />
            </Field>

            <Field label="Summary" htmlFor="summary" error={err("summary")}
              hint="One or two sentences, shown on the services index and in the header menu. Max 500 characters.">
              <Textarea id="summary" name="summary" rows={3} defaultValue={service?.summary ?? ""} maxLength={500} />
            </Field>

            <EditorField name="body" defaultValue={service?.body ?? ""} error={err("body")} />
          </div>

          <aside className="grid content-start gap-0">
            <Field label="Status" htmlFor="status" error={err("status")} variant="float-static">
              <Select id="status" name="status" defaultValue={service?.status ?? "draft"}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>

            <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")}
              hint="Lower numbers come first on the index and in the menu.">
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={service?.sort_order ?? 0} />
            </Field>
          </aside>
        </div>

        <div>
          <IconField defaultValue={service?.icon ?? null} error={err("icon")} />
        </div>

        <div>
          <FaqField defaultValue={service?.faqs ?? []} error={rowErr("faqs")} />
        </div>

        <SeoPanel seo={service?.seo} defaults={service?.seo_defaults} error={seoErr} embedded />
      </Tabs>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create service"}
        </Button>
        <Link href="/admin/services" className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
        {editing && (
          <span className="ml-auto">
            <Button type="submit" variant="destructive" size="sm" formAction={deleteServiceAction} formNoValidate
              onClick={(e) => { if (!window.confirm(`Delete "${service!.title}"? This cannot be undone.`)) e.preventDefault(); }}>
              Delete service
            </Button>
          </span>
        )}
      </div>
    </form>
  );
}
