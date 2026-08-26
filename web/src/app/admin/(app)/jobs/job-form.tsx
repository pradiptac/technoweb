"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormActions } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { createJobAction, updateJobAction, deleteJobAction, type JobState } from "./actions";
import type { AdminJobOpening, JobExperienceLevelRow, JobQualificationRow } from "@/types/api";

const initial: JobState = {};

/**
 * Four panels, and every field named on the tab that owns it.
 *
 * A 422 landing on a hidden panel is otherwise invisible — "could not save"
 * over a form where every visible field looks fine. `buildFormTabs` badges the
 * owning tab and jumps to it, but only for fields it has been told about.
 */
const GROUPS: TabGroup[] = [
  {
    id: "content", label: "Content",
    fields: ["title", "slug", "summary", "description", "status", "published_at", "closes_at", "sort_order"],
  },
  {
    id: "details", label: "The role",
    fields: ["department", "location", "employment_type", "openings",
             "job_experience_level_id", "qualification_ids",
             "salary_min", "salary_max", "salary_period", "salary_currency",
             "responsibilities", "requirements"],
  },
  { id: "seo", label: "SEO", fields: ["seo"] },
];

export function JobForm({
  job, qualifications, levels, saved,
}: {
  job?: AdminJobOpening;
  qualifications: JobQualificationRow[];
  levels: JobExperienceLevelRow[];
  saved?: string;
}) {
  const editing = Boolean(job);
  const [state, formAction, pending] = useActionState(
    editing ? updateJobAction : createJobAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  const chosen = new Set(job?.qualification_ids ?? []);

  return (
    <form action={formAction} noValidate>
      {editing && <input type="hidden" name="id" value={job!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      {saved && !state.error && (
        <Alert tone="ok" title={saved === "created" ? "Vacancy created" : "Saved"}>
          {job?.is_open ? (
            <>Live at <Link className="underline" href={`/careers/${job.slug}`}>/careers/{job.slug}</Link>.</>
          ) : job?.status === "published" ? (
            "Published, but past its closing date — it is not accepting applications."
          ) : (
            "Saved as a draft. It is not on the careers page yet."
          )}
        </Alert>
      )}

      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        {/* ------------------------------------------------------- content */}
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Job title" htmlFor="title" error={err("title")}>
              <Input id="title" name="title" defaultValue={job?.title} required aria-invalid={Boolean(err("title"))} />
            </Field>

            <Field label="URL slug" htmlFor="slug" error={err("slug")}
              hint="Left blank, it is made from the title. Changing it writes a redirect from the old one.">
              <Input id="slug" name="slug" defaultValue={job?.slug} />
            </Field>

            <Field label="Summary" htmlFor="summary" error={err("summary")}
              hint="One or two lines. This is what the careers list shows.">
              <Textarea id="summary" name="summary" rows={2} defaultValue={job?.summary ?? ""} />
            </Field>

            <EditorField name="description" label="About the role" defaultValue={job?.description ?? ""} error={err("description")} />
          </div>

          <aside>
            <Field label="Status" htmlFor="status" error={err("status")}>
              <Select id="status" name="status" defaultValue={job?.status ?? "draft"}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>

            <Field label="Published on" htmlFor="published_at" error={err("published_at")}
              hint="Left blank when publishing, this is set to now.">
              <Input id="published_at" name="published_at" type="date"
                defaultValue={job?.published_at ? job.published_at.slice(0, 10) : ""} />
            </Field>

            <Field label="Applications close" htmlFor="closes_at" error={err("closes_at")}
              hint="After this date the role drops off the careers page and stops taking applications, on its own.">
              <Input id="closes_at" name="closes_at" type="date" defaultValue={job?.closes_at ?? ""} />
            </Field>

            <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")}
              hint="Lower numbers come first.">
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={job?.sort_order ?? 0} />
            </Field>
          </aside>
        </div>

        {/* ------------------------------------------------------- the role */}
        <div className="grid gap-x-8 md:grid-cols-2">
          <Field label="Team or department" htmlFor="department" error={err("department")}
            hint="Roles are grouped by this on the careers page.">
            <Input id="department" name="department" defaultValue={job?.department ?? ""} />
          </Field>

          <Field label="Location" htmlFor="location" error={err("location")}>
            <Input id="location" name="location" defaultValue={job?.location ?? ""} placeholder="Mumbai" />
          </Field>

          <Field label="Employment type" htmlFor="employment_type" error={err("employment_type")}>
            <Select id="employment_type" name="employment_type" defaultValue={job?.employment_type ?? "full_time"}>
              <option value="full_time">Full time</option>
              <option value="part_time">Part time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
              <option value="temporary">Temporary</option>
            </Select>
          </Field>

          <Field label="Openings" htmlFor="openings" error={err("openings")}>
            <Input id="openings" name="openings" type="number" min={1} defaultValue={job?.openings ?? 1} />
          </Field>

          <Field label="Experience level" htmlFor="job_experience_level_id" error={err("job_experience_level_id")}>
            <Select id="job_experience_level_id" name="job_experience_level_id"
              defaultValue={job?.job_experience_level_id ?? ""}>
              <option value="">Not specified</option>
              {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>

          <div />

          <Field label="Salary from" htmlFor="salary_min" error={err("salary_min")}
            hint="Optional. Leave both blank and no salary is shown at all.">
            <Input id="salary_min" name="salary_min" type="number" min={0} defaultValue={job?.salary_min ?? ""} />
          </Field>

          <Field label="Salary to" htmlFor="salary_max" error={err("salary_max")}>
            <Input id="salary_max" name="salary_max" type="number" min={0} defaultValue={job?.salary_max ?? ""} />
          </Field>

          <Field label="Currency" htmlFor="salary_currency" error={err("salary_currency")}>
            <Input id="salary_currency" name="salary_currency" defaultValue={job?.salary_currency ?? "INR"} maxLength={3} />
          </Field>

          <Field label="Per" htmlFor="salary_period" error={err("salary_period")}>
            <Select id="salary_period" name="salary_period" defaultValue={job?.salary_period ?? "year"}>
              <option value="year">Year</option>
              <option value="month">Month</option>
            </Select>
          </Field>
        </div>

        <Field label="What they will do" htmlFor="responsibilities" error={err("responsibilities")}
          hint="One per line." variant="above">
          <Textarea id="responsibilities" name="responsibilities" rows={5}
            defaultValue={(job?.responsibilities ?? []).join("\n")} />
        </Field>

        <Field label="What we are looking for" htmlFor="requirements" error={err("requirements")}
          hint="One per line." variant="above">
          <Textarea id="requirements" name="requirements" rows={5}
            defaultValue={(job?.requirements ?? []).join("\n")} />
        </Field>

        <fieldset className="mb-[18px]">
          <legend className="mb-[7px] text-[13.5px] font-semibold">Accepted qualifications</legend>
          {qualifications.length === 0 ? (
            <p className="text-[13px] text-muted">
              None set up yet — add some under{" "}
              <Link href="/admin/jobs/reference" className="text-brand-ink underline">
                Qualifications &amp; experience
              </Link>.
            </p>
          ) : (
            <div className="grid gap-1.5 rounded border border-line-strong bg-card p-3 sm:grid-cols-2">
              {qualifications.map((q) => (
                <label key={q.id} className="flex items-center gap-2 text-[13.5px]">
                  <input type="checkbox" name="qualification_ids" value={q.id} defaultChecked={chosen.has(q.id)} />
                  {q.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {/* ----------------------------------------------------------- seo */}
        <SeoPanel seo={job?.seo ?? undefined} defaults={job?.seo_defaults} error={(f) => state.fieldErrors?.[`seo.${f}`]?.[0]} embedded />
      </Tabs>

      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save vacancy" : "Create vacancy"}
        </Button>

        {editing && (
          <button
            type="submit"
            formAction={deleteJobAction}
            formNoValidate
            onClick={(e) => {
              if (!window.confirm(
                "Delete this vacancy? Applications it received are kept, and stay on the applications screen.",
              )) e.preventDefault();
            }}
            className="ml-auto text-[13.5px] font-semibold text-err hover:underline"
          >
            Delete vacancy
          </button>
        )}
      </FormActions>
    </form>
  );
}
