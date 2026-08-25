"use client";

import Link from "next/link";
import { FormActions } from "@/components/admin/form-actions";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { createPageAction, updatePageAction, deletePageAction, type PageFormState } from "./actions";
import type { AdminPage } from "@/types/api";

const initial: PageFormState = {};

/** Two panels: the page, and the overrides almost nobody touches. */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["title", "slug", "body", "status", "published_at", "template"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
];

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PageForm({ page, saved }: { page?: AdminPage; saved?: boolean }) {
  const editing = Boolean(page);
  const [state, formAction, pending] = useActionState(
    editing ? updatePageAction : createPageAction,
    initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];

  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  return (
    <form action={formAction} noValidate>
      {editing && <input type="hidden" name="id" value={page!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          {page?.status === "published"
            ? <>Live at <Link className="underline" href={`/${page.slug}`}>/{page.slug}</Link>.</>
            : "Saved as a draft — it is not on the public site yet."}
        </Alert>
      )}

      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Title" htmlFor="title" error={err("title")}>
              <Input id="title" name="title" defaultValue={page?.title} required
                aria-invalid={Boolean(err("title"))} />
            </Field>

            <Field label="Slug" htmlFor="slug" error={err("slug")}
              hint={editing
                ? "This is the URL: /slug. Changing it leaves a 301 behind automatically."
                : "Leave blank to build one from the title. The page will live at /slug."}>
              <Input id="slug" name="slug" defaultValue={page?.slug} className="font-mono text-[14px]"
                aria-invalid={Boolean(err("slug"))} />
            </Field>

            <EditorField name="body" defaultValue={page?.body ?? ""} error={err("body")} />
          </div>

          <aside className="grid content-start gap-0">
            <Field label="Status" htmlFor="status" error={err("status")} variant="float-static">
              <Select id="status" name="status" defaultValue={page?.status ?? "draft"}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>

            <Field label="Publish date" htmlFor="published_at" error={err("published_at")}
              hint="Leave blank when publishing and it is set to now.">
              <Input id="published_at" name="published_at" type="datetime-local"
                defaultValue={toLocalInput(page?.published_at ?? null)} />
            </Field>

            <Field label="Template" htmlFor="template" error={err("template")}
              variant="float-static"
              hint="Wide drops the reading-width cap — use it for a page built around a slider or gallery.">
              <Select id="template" name="template" defaultValue={page?.template ?? "default"}>
                <option value="default">Default — text width</option>
                <option value="wide">Wide — full container</option>
              </Select>
            </Field>
          </aside>
        </div>

        <SeoPanel seo={page?.seo} defaults={page?.seo_defaults} error={seoErr} embedded />
      </Tabs>

      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create page"}
        </Button>
        <Link href="/admin/pages" className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>

        {editing && (
          <span className="ml-auto">
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              formAction={deletePageAction}
              formNoValidate
              onClick={(e) => {
                if (!window.confirm(`Delete "${page!.title}"? /${page!.slug} will start returning 404.`)) {
                  e.preventDefault();
                }
              }}
            >
              Delete page
            </Button>
          </span>
        )}
      </FormActions>
    </form>
  );
}
