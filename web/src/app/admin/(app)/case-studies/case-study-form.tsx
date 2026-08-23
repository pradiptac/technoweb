"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { ResultsField } from "@/components/admin/results-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { CoverField } from "@/components/admin/cover-field";
import {
  createCaseStudyAction, updateCaseStudyAction, deleteCaseStudyAction,
  type CaseStudyFormState,
} from "./actions";
import type { AdminCaseStudy, AdminIndustry } from "@/types/api";

const initial: CaseStudyFormState = {};

/** Three panels; the field lists map a 422 back to the tab holding it. */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["title", "slug", "summary", "results", "body", "status",
             "industry_id", "client_name"] },
  { id: "media", label: "Media", fields: ["cover_image_path"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
];

export function CaseStudyForm({
  study, industries, saved,
}: {
  study?: AdminCaseStudy;
  industries: AdminIndustry[];
  saved?: boolean;
}) {
  const editing = Boolean(study);
  const [state, formAction, pending] = useActionState(
    editing ? updateCaseStudyAction : createCaseStudyAction,
    initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];

  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  // The API reports per-row problems as results.0.value; surface the first
  // of them against the whole field rather than losing it.
  const resultsErr = err("results")
    ?? Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith("results."))?.[1]?.[0];

  return (
    <form action={formAction} noValidate>
      {editing && <input type="hidden" name="id" value={study!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          {study?.status === "published"
            ? <>Live at <Link className="underline" href={`/case-studies/${study.slug}`}>/case-studies/{study.slug}</Link>.</>
            : "Saved as a draft — it is not on the public site yet."}
        </Alert>
      )}

      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Title" htmlFor="title" error={err("title")}>
              <Input id="title" name="title" defaultValue={study?.title} required
                aria-invalid={Boolean(err("title"))} />
            </Field>

            <Field label="Slug" htmlFor="slug" error={err("slug")}
              hint={editing
                ? "Changing this leaves a 301 behind automatically, so old links keep working."
                : "Leave blank to build one from the title."}>
              <Input id="slug" name="slug" defaultValue={study?.slug} className="font-mono text-[14px]"
                aria-invalid={Boolean(err("slug"))} />
            </Field>

            <Field label="Summary" htmlFor="summary" error={err("summary")}
              hint="Shown on the case-studies index and used as the meta description when no SEO override is set. Max 500 characters.">
              <Textarea id="summary" name="summary" rows={3} defaultValue={study?.summary ?? ""}
                maxLength={500} aria-invalid={Boolean(err("summary"))} />
            </Field>

            <ResultsField defaultValue={study?.results ?? []} error={resultsErr} />

            <EditorField name="body" defaultValue={study?.body ?? ""} error={err("body")} />
          </div>

          <aside className="grid content-start gap-0">
            <Field label="Status" htmlFor="status" error={err("status")} variant="float-static">
              <Select id="status" name="status" defaultValue={study?.status ?? "draft"}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>

            <Field label="Industry" htmlFor="industry_id" error={err("industry_id")} variant="float-static">
              <Select id="industry_id" name="industry_id" defaultValue={study?.industry_id ?? ""}>
                <option value="">Not sector specific</option>
                {industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </Select>
            </Field>

            <Field label="Client name" htmlFor="client_name" error={err("client_name")}
              hint="Leave blank where the client has not agreed to be named.">
              <Input id="client_name" name="client_name" defaultValue={study?.client_name ?? ""} />
            </Field>
          </aside>
        </div>

        <div>
          <CoverField
            defaultPath={study?.cover_image_path ?? null}
            defaultUrl={study?.cover_image ?? null}
          />
        </div>

        <SeoPanel seo={study?.seo} defaults={study?.seo_defaults} error={seoErr} embedded />
      </Tabs>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create case study"}
        </Button>
        <Link href="/admin/case-studies" className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>

        {editing && (
          <span className="ml-auto">
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              formAction={deleteCaseStudyAction}
              formNoValidate
              onClick={(e) => {
                if (!window.confirm(`Delete "${study!.title}"? This cannot be undone.`)) {
                  e.preventDefault();
                }
              }}
            >
              Delete case study
            </Button>
          </span>
        )}
      </div>
    </form>
  );
}
