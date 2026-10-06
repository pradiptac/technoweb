"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/admin/form-actions";
import { FormDraft } from "@/components/admin/form-draft";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { FieldBuilder } from "./field-builder";
import { createFormAction, updateFormAction, type FormState } from "./actions";
import { buildHtmlSnippet } from "./embed-html";
import { kindsFrom, needsFrame } from "./form-kinds";
import type { AdminForm, FormMeta } from "@/lib/admin";

const initial: FormState = {};

/**
 * Which panel owns which field, so a 422 can badge its tab and open it.
 *
 * `fields` covers every `fields.N.*` key the builder can be refused over —
 * `fields.2.settings.max_kb`, `fields.4.show_if.field` — because a key matches
 * a group by prefix. A new input must be added to its panel's list here, or
 * its error is charged to the first tab.
 */
const GROUPS: TabGroup[] = [
  { id: "details", label: "Details", fields: ["name", "slug", "status", "submit_label", "notify_email", "success_message", "redirect_url"] },
  { id: "fields", label: "Fields", fields: ["fields"] },
  { id: "embed", label: "Put it on a page", fields: ["embed_enabled"] },
];

/**
 * The iframe somebody pastes into the other site.
 *
 * `site` is the origin the snippets name: the server's `siteUrl()`, handed
 * down by the page, rather than `window.location` — these are read in the
 * console and pasted onto a different machine entirely, and a developer
 * working at localhost would otherwise hand somebody a snippet pointing at
 * their own laptop. It is the value `metadataBase` and every canonical are
 * built on, and it is runtime configuration, which a client component cannot
 * read for itself (`lib/site-url.ts`).
 *
 * `title` is on it deliberately: a frame with no accessible name is announced
 * as "frame" and nothing else, and this one is going onto a page whose
 * accessibility is somebody else's reputation as well as ours.
 */
function embedSnippet(site: string, slug: string): string {
  return `<iframe
  src="${site}/embed/forms/${slug || "your-slug"}"
  title="Enquiry form"
  loading="lazy"
  style="width:100%;height:620px;border:0"
></iframe>`;
}

/**
 * One form, in three panels: what it is called and what happens after it is
 * sent, the fields, and the ways of putting it on a page.
 *
 * It was a single column until the builder grew kinds, conditions and steps —
 * the fields sat below both embed boxes, a screen and a half down. Every panel
 * stays mounted (`Tabs` hides, never unmounts), so the hidden `fields` JSON and
 * the embed tick box post whichever panel is showing; and the form is
 * `noValidate`, because a `required` name on a hidden panel would otherwise
 * block the save with a browser message nobody can see. The API's own 422 is
 * the check, and it opens the panel it is about.
 */
export function FormForm({
  form, meta, saved, site,
}: { form?: AdminForm; meta?: FormMeta; saved?: boolean; site: string }) {
  const action = form ? updateFormAction.bind(null, form.id) : createFormAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const [slug, setSlug] = useState(form?.slug ?? "");

  const err = (field: string) => state.fieldErrors?.[field]?.[0];
  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  const kinds = kindsFrom(meta);
  /*
    Read off the *saved* form, like the HTML below it: both describe what a
    copy taken now would contain, and a field added a moment ago and not yet
    saved is in neither.
  */
  const frameOnly = needsFrame(kinds, form?.fields ?? []);

  return (
    <Form action={formAction} state={state} noValidate>
      {/* A draft in localStorage, offered back after a refresh or a crash. */}
      <FormDraft />

      {saved && !state.error && (
        <Alert tone="ok" title="Saved">The form is live wherever its shortcode appears.</Alert>
      )}
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      {/* Three children, one per entry in GROUPS and in that order — `Tabs` reads them by position. */}
      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        <div className="grid gap-x-4 lg:grid-cols-2">
          <Field label="Name" htmlFor="name" error={err("name")}>
            <Input id="name" name="name" defaultValue={form?.name} required />
          </Field>

          <Field label="Slug" htmlFor="slug" error={err("slug")}
            hint="Leave blank to generate one. Changing it breaks every shortcode already using it.">
            <Input id="slug" name="slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="contact" />
          </Field>

          <Field label="Status" htmlFor="status" variant="float-static" error={err("status")}>
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

          <Field label="After sending" htmlFor="redirect_url" error={err("redirect_url")}
            hint="Send the visitor to this address instead of showing the message. A page on this site (/thank-you) or a full https:// address. Blank shows the message.">
            <Input
              id="redirect_url" name="redirect_url" inputMode="url" autoCapitalize="none" spellCheck={false}
              defaultValue={form?.redirect_url ?? ""} placeholder="/thank-you"
            />
          </Field>
        </div>

        <FieldBuilder fields={form?.fields ?? []} meta={meta} errors={state.fieldErrors} />

        <>
          <div className="mb-6 rounded-lg border border-line-strong bg-surface p-4">
            <p className="text-13 font-semibold">Put this form on a page</p>
            <p className="mt-1 text-13 text-muted">
              Paste this into any page, post, article or case-study body:
            </p>
            <code className="mt-2 block rounded border border-line bg-card px-3 py-2 font-mono text-13 select-all [overflow-wrap:anywhere]">
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
            <p className="text-13 font-semibold">Put this form on another website</p>

            <label className="mt-2 flex items-start gap-2 text-13">
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
            {err("embed_enabled") && <p className="mt-1.5 text-12-5 text-err">{err("embed_enabled")}</p>}

            <p className="mt-3 text-13 text-muted">
              Paste this into the other site&rsquo;s page. Submissions arrive in{" "}
              <strong className="font-semibold text-ink">Leads</strong> like every other enquiry, and
              the lead records <em>their</em> page as the source.
            </p>
            <code className="mt-2 block overflow-x-auto rounded border border-line bg-card px-3 py-2 font-mono text-13 whitespace-pre select-all">
              {embedSnippet(site, slug)}
            </code>
            <p className="mt-2 text-12 text-muted">
              The height is fixed because a frame cannot size itself to its contents from the
              outside. Set it to suit the form&rsquo;s length — too small and the visitor scrolls
              inside a box.
            </p>

            {frameOnly ? (
              /*
                No HTML copy for a form that needs behaviour. An upload is a
                multipart post, a step is a wizard and a condition is a field
                that appears — none of which plain markup carries, and a copy
                that quietly lacked them would be worse than no copy.
                `dismissible={false}`: it is standing information about this
                form, not news, so it stays inline and stays put.
              */
              <div className="mt-4 border-t border-line pt-3">
                <Alert tone="info" title="The frame is the only way to embed this form" dismissible={false}>
                  This form uses uploads, steps or conditions, which only work in the frame. A copy
                  of the markup could not send a file, would show every step at once and would
                  never hide a field, so it is not offered here. The frame above is the form
                  itself and does all three.
                </Alert>
              </div>
            ) : (
              /*
                The second offer, and the one with a cost worth naming at the point
                somebody chooses it rather than in a document nobody opens.

                A copy of the markup is a snapshot. Add a field here afterwards and
                their page does not have it, remove one and their page posts a key
                the form no longer declares — which `FormValidator` silently drops,
                so nothing anywhere reports the drift. The iframe cannot drift
                because it is not a copy.
              */
              <details className="mt-4 border-t border-line pt-3">
                <summary className="cursor-pointer text-13 font-semibold">
                  Or copy the form as HTML, to style it yourself
                </summary>

                <p className="mt-2 text-13 text-muted">
                  Plain markup with no styling of ours, so their stylesheet decides how it looks. It
                  posts to this site and the enquiry arrives in Leads exactly as the framed version
                  does.
                </p>
                <p className="mt-2 text-13 text-muted">
                  <strong className="font-semibold text-ink">It is a copy, and copies go stale.</strong>{" "}
                  Change the fields and this markup no longer matches — nothing on their page or
                  ours will say so. It is built from the form as it was last <em>saved</em>: save,
                  then send them the snippet again after any change, or use the frame above, which
                  cannot fall out of step because it is not a copy.
                </p>
                <p className="mt-2 text-13 text-muted">
                  Two things in it must survive being restyled: the hidden{" "}
                  <code className="font-mono">website</code> field, which is the spam trap the server
                  checks, and the <code className="font-mono">&lt;label for&gt;</code> on every input.
                  It needs JavaScript; without it the browser would navigate away to a page of raw
                  data. A hidden field is left out: the server fills its value in.
                </p>

                <code className="mt-3 block max-h-80 overflow-auto rounded border border-line bg-card px-3 py-2 font-mono text-12 whitespace-pre select-all">
                  {buildHtmlSnippet(form, slug, site, kinds)}
                </code>
              </details>
            )}
          </div>
        </>
      </Tabs>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : form ? "Save form" : "Create form"}
        </Button>
      </FormActions>
    </Form>
  );
}
