"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/admin/form-actions";
import { FieldBuilder } from "./field-builder";
import { createFormAction, updateFormAction, type FormState } from "./actions";
import { buildHtmlSnippet } from "./embed-html";
import type { SiteForm } from "@/types/api";

const initial: FormState = {};

/**
 * The origin the snippets name.
 *
 * `NEXT_PUBLIC_SITE_URL` rather than `window.location`, because these are read
 * in the console and pasted onto a different machine entirely — a developer
 * working at localhost would otherwise hand somebody a snippet pointing at
 * their own laptop. It is the same value `metadataBase` and every canonical are
 * built on, so it names the host the site is actually served from.
 */
function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.technoware.in";
}

/**
 * The iframe somebody pastes into the other site.
 *
 * `title` is on it deliberately: a frame with no accessible name is announced
 * as "frame" and nothing else, and this one is going onto a page whose
 * accessibility is somebody else's reputation as well as ours.
 */
function embedSnippet(slug: string): string {
  const site = siteUrl();

  return `<iframe
  src="${site}/embed/forms/${slug || "your-slug"}"
  title="Enquiry form"
  loading="lazy"
  style="width:100%;height:620px;border:0"
></iframe>`;
}

export function FormForm({ form, saved }: { form?: SiteForm; saved?: boolean }) {
  const action = form ? updateFormAction.bind(null, form.id) : createFormAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const [slug, setSlug] = useState(form?.slug ?? "");

  const err = (field: string) => state.fieldErrors?.[field]?.[0];

  return (
    <Form action={formAction} state={state}>
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">The form is live wherever its shortcode appears.</Alert>
      )}
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Name" htmlFor="name" error={err("name")}>
          <Input id="name" name="name" defaultValue={form?.name} required />
        </Field>

        <Field label="Slug" htmlFor="slug" error={err("slug")}
          hint="Leave blank to generate one. Changing it breaks every shortcode already using it.">
          <Input id="slug" name="slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="contact" />
        </Field>

        <Field label="Status" htmlFor="status" variant="float-static">
          <Select id="status" name="status" defaultValue={form?.status ?? "published"}>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>

        <Field label="Submit button label" htmlFor="submit_label" error={err("submit_label")}>
          <Input id="submit_label" name="submit_label" defaultValue={form?.submit_label ?? "Send"} />
        </Field>

        <Field label="Notify" htmlFor="notify_email" error={err("notify_email")}
          hint="Where submissions are emailed. Blank uses the sales address from Settings.">
          <Input id="notify_email" name="notify_email" type="email" defaultValue={form?.notify_email ?? ""} />
        </Field>

        <Field label="Message after sending" htmlFor="success_message" error={err("success_message")}
          hint="Shown in place of the fields once it has gone.">
          <Textarea id="success_message" name="success_message" rows={2} defaultValue={form?.success_message ?? ""} />
        </Field>
      </div>

      <div className="mb-6 rounded-lg border border-line-strong bg-surface p-4">
        <p className="text-[13px] font-semibold">Put this form on a page</p>
        <p className="mt-1 text-[13px] text-muted">
          Paste this into any page, post, article or case-study body:
        </p>
        <code className="mt-2 block rounded border border-line bg-card px-3 py-2 font-mono text-[13px] select-all">
          {`[form slug="${slug || "your-slug"}"]`}
        </code>
      </div>

      {/*
        Putting the same form on a *different* website.

        The snippet is drawn from the live slug field rather than from the saved
        record, exactly as the shortcode above it is, so it is readable while
        the form is still being created. It says plainly that it does not work
        until both halves are true — saved, and ticked — because a snippet
        somebody copies out of a form they then abandon is one they will paste
        and watch 404.
      */}
      <div className="mb-6 rounded-lg border border-line-strong bg-surface p-4">
        <p className="text-[13px] font-semibold">Put this form on another website</p>

        <label className="mt-2 flex items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            name="embed_enabled"
            value="1"
            defaultChecked={form?.embed_enabled ?? false}
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            Allow this form to be embedded elsewhere
            <span className="mt-0.5 block text-muted">
              Off by default. Until this is ticked and saved, the address below answers 404 —
              which is what keeps a form built for one page of this site from appearing on
              somebody else&rsquo;s.
            </span>
          </span>
        </label>

        <p className="mt-3 text-[13px] text-muted">
          Paste this into the other site&rsquo;s page. Submissions arrive in{" "}
          <strong className="font-semibold text-ink">Leads</strong> like every other enquiry, and
          the lead records <em>their</em> page as the source.
        </p>
        <code className="mt-2 block overflow-x-auto rounded border border-line bg-card px-3 py-2 font-mono text-[13px] whitespace-pre select-all">
          {embedSnippet(slug)}
        </code>
        <p className="mt-2 text-[12px] text-muted">
          The height is fixed because a frame cannot size itself to its contents from the
          outside. Set it to suit the form&rsquo;s length — too small and the visitor scrolls
          inside a box.
        </p>

        {/*
          The second offer, and the one with a cost worth naming at the point
          somebody chooses it rather than in a document nobody opens.

          A copy of the markup is a snapshot. Add a field here afterwards and
          their page does not have it, remove one and their page posts a key
          the form no longer declares — which `FormValidator` silently drops,
          so nothing anywhere reports the drift. The iframe cannot drift
          because it is not a copy.
        */}
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-[13px] font-semibold">
            Or copy the form as HTML, to style it yourself
          </summary>

          <p className="mt-2 text-[13px] text-muted">
            Plain markup with no styling of ours, so their stylesheet decides how it looks. It
            posts to this site and the enquiry arrives in Leads exactly as the framed version
            does.
          </p>
          <p className="mt-2 text-[13px] text-muted">
            <strong className="font-semibold text-ink">It is a copy, and copies go stale.</strong>{" "}
            Change the fields below and this markup no longer matches — nothing on their page or
            ours will say so. Send them the snippet again after any change, or use the frame
            above, which cannot fall out of step because it is not a copy.
          </p>
          <p className="mt-2 text-[13px] text-muted">
            Two things in it must survive being restyled: the hidden{" "}
            <code className="font-mono">website</code> field, which is the spam trap the server
            checks, and the <code className="font-mono">&lt;label for&gt;</code> on every input.
            It needs JavaScript; without it the browser would navigate away to a page of raw
            data.
          </p>

          <code className="mt-3 block max-h-80 overflow-auto rounded border border-line bg-card px-3 py-2 font-mono text-[12px] whitespace-pre select-all">
            {buildHtmlSnippet(form, slug, siteUrl())}
          </code>
        </details>
      </div>

      <h2 className="admin-title mb-3 text-[17px]">Fields</h2>
      <FieldBuilder fields={form?.fields ?? []} />

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : form ? "Save form" : "Create form"}
        </Button>
      </FormActions>
    </Form>
  );
}
