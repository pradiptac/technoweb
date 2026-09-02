"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { useActionState } from "react";
import { FormActions } from "@/components/admin/form-actions";
import { EditorField } from "@/components/admin/editor-field";
import { Tabs } from "@/components/admin/tabs";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { updateLandingPageAction, deleteLandingPageAction, type LandingFormState } from "./actions";
import type { AdminLandingPage } from "@/types/api";

const initial: LandingFormState = {};

/**
 * Editing one landing page.
 *
 * The gate's verdict is rendered **above the fields**, not beside the save
 * button, because it is the thing the person came to act on: a generated page
 * arrives with a title, a path and nothing else, and what they need first is
 * the list of what it still lacks. A 422 from an attempted publish lands in the
 * same panel, so the screen says the same thing in the same place before and
 * after the button is pressed rather than moving the answer around.
 */
export function LandingPageForm({ record, saved, drafted }: {
  record: AdminLandingPage;
  saved?: boolean;
  drafted?: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateLandingPageAction, initial);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  /*
   * A refused publish saves nothing — the request is rejected whole, which is
   * right for an API and unkind on its own for a person who has just written
   * four hundred words. The inputs here are uncontrolled and `EditorField`
   * holds its own state, so a failed action re-renders without losing any of
   * it; what was missing was anybody saying so, which `toState` now does.
   */

  /*
   * The refusals from this submission if there were any, otherwise whatever the
   * server said was outstanding when the page loaded. The two are the same list
   * from the same class — one is just fresher.
   */
  const gateErrors = state.fieldErrors?.status;
  const blocking = gateErrors?.length
    ? gateErrors.map((detail, i) => ({ key: `err-${i}`, label: "", detail }))
    : record.failures;

  return (
    <Form action={formAction} state={state} noValidate>
      <input type="hidden" name="id" value={record.id} />
      {/*
        What the page is about is fixed at creation and carried through as
        hidden fields. Re-pointing an existing page at a different brand is a
        different page with the same body, which is the shape of exactly the
        duplicate this module refuses — so it is not offered here.
      */}
      <input type="hidden" name="kind" value={record.kind} />
      <input type="hidden" name="brand_id" value={record.brand_id ?? ""} />
      <input type="hidden" name="product_category_id" value={record.product_category_id ?? ""} />
      <input type="hidden" name="solution_id" value={record.solution_id ?? ""} />
      <input type="hidden" name="service_id" value={record.service_id ?? ""} />
      <input type="hidden" name="location_id" value={record.location_id ?? ""} />

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && <Alert tone="ok" title="Saved">The public page reflects this now.</Alert>}
      {drafted && !state.error && (
        <Alert tone="info" title="Draft created">
          Nothing is live yet. Write an introduction below — in your own words,
          about this combination specifically — and it can be published.
        </Alert>
      )}

      {blocking.length > 0 ? (
        <Alert tone="warn" title="Not publishable yet">
          <ul className="mt-1 grid gap-1.5">
            {blocking.map((f) => (
              <li key={f.key} className="text-[13px]">
                {f.label && <span className="font-semibold">{f.label}: </span>}{f.detail}
              </li>
            ))}
          </ul>
        </Alert>
      ) : (
        <Alert tone="ok" title="Ready to publish">
          Everything this needs is in place. Set the status to Published and save.
        </Alert>
      )}

      <Tabs tabs={[{ id: "content", label: "Content" }, { id: "seo", label: "SEO" }]}>
        <section>
          <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
            <div className="min-w-0">
              <Field label="Title" htmlFor="title" error={err("title")}
                hint="Used in the browser tab and the search result. Under 60 characters.">
                <Input id="title" name="title" defaultValue={record.title} required
                  aria-invalid={Boolean(err("title"))} />
              </Field>

              <Field label="Heading" htmlFor="heading" error={err("heading")}
                hint="The h1 on the page. Free to differ from the title — a heading is read, a title is scanned in a list of ten.">
                <Input id="heading" name="heading" defaultValue={record.heading} required
                  aria-invalid={Boolean(err("heading"))} />
              </Field>

              {/*
                The field the whole module turns on. Everything else about this
                page is derived from records that already exist; this is the
                only part that makes it a page rather than a query result, and
                it is what the duplicate check reads.
              */}
              <EditorField name="intro" label="Introduction" defaultValue={record.intro ?? ""} />
              <p className="measure -mt-2 mb-5 text-[12.5px] text-muted">
                What is true about this combination and nothing else — what you have
                actually fitted, what tends to go wrong, what you would say on the
                phone. At least 40 words, and it must not read like another page
                with one word changed.
              </p>

              <EditorField name="body" label="Body (optional)" defaultValue={record.body ?? ""} />
            </div>

            <aside className="min-w-0">
              <Field label="Status" htmlFor="status" variant="float-static" error={err("status")}>
                <Select id="status" name="status" defaultValue={record.status}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </Select>
              </Field>

              <div className="rounded-lg border border-line bg-surface p-4 text-[13px]">
                <p className="font-semibold text-ink">{record.kind_label}</p>
                <p className="mt-1 break-all font-mono text-[12px] text-muted">{record.path}</p>

                {/*
                  Why this page was proposed, kept from the moment it was — the
                  catalogue moves, and "three products stood behind this" is a
                  question asked months later when it cannot be recomputed.
                */}
                {record.evidence && (
                  <dl className="mt-3 grid gap-1.5 text-[12.5px] text-muted">
                    {Object.entries(record.evidence).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3">
                        <dt className="capitalize">{k.replace(/_/g, " ")}</dt>
                        <dd className="font-medium text-ink">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {record.status === "published" && (
                  <Link href={record.public_path} target="_blank" rel="noreferrer"
                    className="mt-3 inline-block text-[13px] font-semibold text-brand-ink hover:underline">
                    View on the site
                  </Link>
                )}
              </div>
            </aside>
          </div>
        </section>

        <section>
          <Field label="Meta title" htmlFor="seo_title" hint="Leave blank to use the title.">
            <Input id="seo_title" name="seo_title" defaultValue={record.seo?.title ?? ""}
              placeholder={record.seo_defaults?.title ?? ""} />
          </Field>

          <Field label="Meta description" htmlFor="seo_description"
            hint="Leave blank and the first 155 characters of the introduction are used. 70–160 characters is what a search result displays.">
            <Textarea id="seo_description" name="seo_description" rows={3}
              defaultValue={record.seo?.description ?? ""}
              placeholder={record.seo_defaults?.description ?? ""} />
          </Field>
        </section>
      </Tabs>

      <FormActions>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
        <Link href="/admin/landing-pages"
          className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
        <span className="ml-auto">
          <Button
            type="submit" variant="destructive" size="sm"
            formAction={deleteLandingPageAction} formNoValidate
            onClick={(e) => {
              if (!window.confirm(`Delete “${record.title}”? Its URL will 404 unless a redirect handles it.`)) {
                e.preventDefault();
              }
            }}
          >
            Delete page
          </Button>
        </span>
      </FormActions>
    </Form>
  );
}
