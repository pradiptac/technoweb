"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/admin/form-actions";
import { FormDraft } from "@/components/admin/form-draft";
import { EditPresence } from "@/components/admin/edit-presence";
import { StaleAlert } from "@/components/admin/stale-alert";
import { SummaryAi } from "@/components/admin/writing/summary-ai";
import { EditorField } from "@/components/admin/editor-field";
import { RecordSwitch } from "@/components/admin/record-switch";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { TenderDocumentsField } from "./documents-field";
import { createTenderAction, deleteTenderAction, updateTenderAction, type TenderState } from "./actions";
import type { AdminTender, TenderMeta } from "@/lib/admin";

const initial: TenderState = {};

/**
 * Which panel owns which field, so a 422 can badge its tab and open it.
 *
 * A key matches a group by equality or as a prefix, so `documents` covers
 * `documents.0.file_path` and `seo` covers `seo.title`. **A new input must
 * be added to its panel's list here**, or its error is charged to the first
 * tab — and the order here is the order of the five children of `<Tabs>`
 * below, which reads them by position.
 */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content", fields: ["reference", "title", "slug", "summary", "description", "status", "is_featured", "sort_order", "tender_category_id"] },
  { id: "dates", label: "Dates and fees", fields: ["opens_at", "closes_at", "opening_at", "prebid_at", "prebid_place", "fee_rupees", "emd_rupees", "fee_paise", "emd_paise"] },
  { id: "documents", label: "Documents", fields: ["documents"] },
  { id: "submission", label: "How to bid", fields: ["submission_email", "submission_url", "submission_address", "contact_name", "contact_phone", "contact_email"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
];

/**
 * One tender, in five panels.
 *
 * Create and edit share the form; they differ in initial values and the
 * action. Every panel stays mounted (`Tabs` hides, never unmounts), so a
 * field on a panel nobody opened is still posted — and the form is
 * `noValidate`, because a `required` closing date on a hidden panel would
 * block the save with a browser message nobody can see. The API's own 422 is
 * the check, and `buildFormTabs` is what makes it visible.
 *
 * **Money is typed in rupees and posted in rupees**, converted to paise in
 * the action. The field is `fee_rupees`, not `fee_paise`: asking an editor
 * for 250000 when they mean ₹2,500 is how a tender goes up with a fee a
 * hundred times too big, and nothing downstream would question it.
 */
export function TenderForm({ tender, meta }: { tender?: AdminTender; meta: TenderMeta }) {
  const editing = Boolean(tender);
  const [state, formAction, pending] = useActionState(
    editing ? updateTenderAction.bind(null, tender!.id) : createTenderAction,
    initial,
  );

  const err = (field: string) => state.fieldErrors?.[field]?.[0];
  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  /** Paise back to rupees for the input — "2500" for ₹2,500, blank for unset. */
  const rupees = (paise: number | null | undefined) =>
    paise === null || paise === undefined ? "" : String(paise / 100);

  return (
    <Form action={formAction} state={state} noValidate>
      {/* A draft in localStorage, offered back after a refresh or a crash. */}
      <FormDraft />
      {editing && <EditPresence type="tender" id={tender!.id} base={tender!.updated_at ?? null} />}
      {editing && <input type="hidden" name="base_updated_at" value={tender!.updated_at ?? ""} />}
      {editing && <input type="hidden" name="id" value={tender!.id} />}
      {/* Where a refused delete returns to: this tender. */}
      {editing && <input type="hidden" name="back" value={`/admin/tenders/${tender!.id}`} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      {/* Five children, one per entry in GROUPS and in that order. */}
      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        {/* ---------------------------------------------------------- Content */}
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field
              label="Tender number" htmlFor="reference" error={err("reference")}
              hint="As you issue it — “TW/2026/014”. It is what a bidder quotes, so it is kept exactly as typed and no two tenders may share one."
            >
              <Input
                id="reference" name="reference" defaultValue={tender?.reference} maxLength={80}
                className="font-mono text-14" autoCapitalize="characters" spellCheck={false}
                aria-invalid={Boolean(err("reference"))}
              />
            </Field>

            <Field label="Title" htmlFor="title" error={err("title")}>
              <Input id="title" name="title" defaultValue={tender?.title} maxLength={180} aria-invalid={Boolean(err("title"))} />
            </Field>

            <Field
              label="Slug" htmlFor="slug" error={err("slug")}
              hint={editing
                ? "The notice's address: /tenders/…. Changing it leaves a 301 behind automatically, so old links keep working."
                : "Leave blank to build one from the title."}
            >
              <Input
                id="slug" name="slug" defaultValue={tender?.slug} className="font-mono text-14"
                autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(err("slug"))}
              />
            </Field>

            <SummaryAi fieldId="summary" type="tender" id={tender?.id} max={300} />
            <Field
              label="Summary" htmlFor="summary" error={err("summary")}
              hint="A sentence or two, shown on the Tenders page and used as the meta description when no SEO override is set. Max 300 characters."
            >
              <Textarea id="summary" name="summary" rows={3} defaultValue={tender?.summary ?? ""} maxLength={300} aria-invalid={Boolean(err("summary"))} />
            </Field>

            <EditorField
              ai={{ surface: "body", ref: { type: "tender", id: tender?.id } }}
              name="description" label="Scope of work" defaultValue={tender?.description ?? ""} error={err("description")}
              hint="What is being bought, the quantities, the standards and the conditions. The dates, the fees and the documents have panels of their own."
            />
          </div>

          <aside className="grid content-start gap-0">
            <Field
              label="Status" htmlFor="status" error={err("status")} variant="float-static"
              hint="Only a published tender is on the site. A notice with no way to submit a bid cannot be published."
            >
              <Select id="status" name="status" defaultValue={tender?.status ?? "draft"}>
                {meta.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>

            <Field
              label="Category" htmlFor="tender_category_id" error={err("tender_category_id")} variant="float-static"
              hint="Optional. What the filter on the Tenders page files it under."
            >
              <Select id="tender_category_id" name="tender_category_id" defaultValue={tender?.tender_category_id ? String(tender.tender_category_id) : ""}>
                <option value="">No category</option>
                {meta.categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}{c.is_active ? "" : " (switched off)"}</option>
                ))}
              </Select>
            </Field>

            <RecordSwitch
              className="mb-[18px]" name="is_featured" defaultChecked={tender?.is_featured ?? false} label="Featured"
              hint="A featured tender leads the Tenders page while it is still open."
            />

            <Field label="Order" htmlFor="sort_order" error={err("sort_order")} hint="Lowest first, among tenders closing on the same day.">
              <Input id="sort_order" name="sort_order" type="number" min={0} max={65535} defaultValue={tender?.sort_order ?? 0} className="w-28" />
            </Field>

            {editing && (
              <p className="text-12-5 text-muted">
                {tender!.state_label}
                {tender!.closes_in_label ? ` · ${tender!.closes_in_label}` : ""}
              </p>
            )}
          </aside>
        </div>

        {/* -------------------------------------------------- Dates and fees */}
        <div className="max-w-[640px]">
          <p className="mb-4 text-13 text-muted">
            Every time is read in {meta.timezone} &mdash; the site&rsquo;s own timezone &mdash; and shown to bidders in it,
            whatever their computer is set to. A tender is marked “closing soon” inside
            {" "}{meta.closing_soon_days} days of its closing date.
          </p>

          <Field label="Opens for bids" htmlFor="opens_at" error={err("opens_at")} hint="When the notice starts accepting bids.">
            <Input id="opens_at" name="opens_at" type="datetime-local" defaultValue={tender?.opens_at ?? ""} aria-invalid={Boolean(err("opens_at"))} />
          </Field>

          <Field
            label="Last date for submission" htmlFor="closes_at" error={err("closes_at")}
            hint="The deadline, to the minute. This is the date the page counts down to."
          >
            <Input id="closes_at" name="closes_at" type="datetime-local" defaultValue={tender?.closes_at ?? ""} aria-invalid={Boolean(err("closes_at"))} />
          </Field>

          <Field
            label="Pre-bid meeting" htmlFor="prebid_at" error={err("prebid_at")}
            hint="Optional. Before the closing date. A time needs a place with it."
          >
            <Input id="prebid_at" name="prebid_at" type="datetime-local" defaultValue={tender?.prebid_at ?? ""} aria-invalid={Boolean(err("prebid_at"))} />
          </Field>

          <Field label="Pre-bid meeting place" htmlFor="prebid_place" error={err("prebid_place")}>
            <Input id="prebid_place" name="prebid_place" defaultValue={tender?.prebid_place ?? ""} maxLength={300} aria-invalid={Boolean(err("prebid_place"))} />
          </Field>

          <Field
            label="Bids opened" htmlFor="opening_at" error={err("opening_at")}
            hint="Optional. On or after the closing date — bids are opened once they are in."
          >
            <Input id="opening_at" name="opening_at" type="datetime-local" defaultValue={tender?.opening_at ?? ""} aria-invalid={Boolean(err("opening_at"))} />
          </Field>

          <div className="grid gap-x-6 sm:grid-cols-2">
            <Field
              label="Tender document fee (₹)" htmlFor="fee_rupees" error={err("fee_paise") ?? err("fee_rupees")}
              hint="In rupees. Leave blank if there is none stated; enter 0 for a free document."
            >
              <Input id="fee_rupees" name="fee_rupees" type="number" min={0} step="0.01" inputMode="decimal" defaultValue={rupees(tender?.fee_paise)} />
            </Field>

            <Field
              label="Earnest money deposit (₹)" htmlFor="emd_rupees" error={err("emd_paise") ?? err("emd_rupees")}
              hint="In rupees. Leave blank if there is none."
            >
              <Input id="emd_rupees" name="emd_rupees" type="number" min={0} step="0.01" inputMode="decimal" defaultValue={rupees(tender?.emd_paise)} />
            </Field>
          </div>
        </div>

        {/* -------------------------------------------------------- Documents */}
        <div className="max-w-[720px]">
          <TenderDocumentsField
            documents={tender?.documents ?? []}
            max={meta.max_documents}
            error={err}
          />
        </div>

        {/* ------------------------------------------------------- How to bid */}
        <div className="max-w-[640px]">
          <p className="mb-4 text-13 text-muted">
            At least one of these three is needed before the tender can be published: a notice nobody can
            answer is worse than no notice.
          </p>

          <Field label="Email a bid to" htmlFor="submission_email" error={err("submission_email")}>
            <Input id="submission_email" name="submission_email" type="email" defaultValue={tender?.submission_email ?? ""} maxLength={191} aria-invalid={Boolean(err("submission_email"))} />
          </Field>

          <Field
            label="Bidding portal" htmlFor="submission_url" error={err("submission_url")}
            hint="A link to the portal bids go through, if there is one."
          >
            <Input id="submission_url" name="submission_url" defaultValue={tender?.submission_url ?? ""} maxLength={500} aria-invalid={Boolean(err("submission_url"))} />
          </Field>

          <Field
            label="Post or deliver to" htmlFor="submission_address" error={err("submission_address")}
            hint="The address a sealed bid is sent to. Line breaks are kept."
          >
            <Textarea id="submission_address" name="submission_address" rows={4} defaultValue={tender?.submission_address ?? ""} maxLength={500} />
          </Field>

          <p className="mb-2 mt-6 text-13 font-semibold">Who to ask about this tender</p>

          <Field label="Name" htmlFor="contact_name" error={err("contact_name")}>
            <Input id="contact_name" name="contact_name" defaultValue={tender?.contact_name ?? ""} maxLength={160} />
          </Field>

          <div className="grid gap-x-6 sm:grid-cols-2">
            <Field label="Telephone" htmlFor="contact_phone" error={err("contact_phone")}>
              <Input id="contact_phone" name="contact_phone" type="tel" defaultValue={tender?.contact_phone ?? ""} maxLength={40} aria-invalid={Boolean(err("contact_phone"))} />
            </Field>

            <Field label="Email" htmlFor="contact_email" error={err("contact_email")}>
              <Input id="contact_email" name="contact_email" type="email" defaultValue={tender?.contact_email ?? ""} maxLength={191} aria-invalid={Boolean(err("contact_email"))} />
            </Field>
          </div>
        </div>

        {/* -------------------------------------------------------------- SEO */}
        <SeoPanel
          seo={tender?.seo ?? undefined}
          defaults={tender?.seo_defaults ?? undefined}
          error={err}
          embedded
          record={editing ? { type: "tender", id: tender!.id } : null}
        />
      </Tabs>

      {state.fieldErrors?.stale && <StaleAlert message={state.fieldErrors.stale[0] ?? ""} />}
      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : editing ? "Save tender" : "Create tender"}
        </Button>
        <Link
          href="/admin/tenders"
          className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink"
        >
          Cancel
        </Link>
        {editing && (
          <Button
            type="submit"
            variant="destructive"
            className="ml-auto"
            formAction={deleteTenderAction}
            formNoValidate
            onClick={(event) => {
              if (!window.confirm("Delete this tender? Its documents stay in the media library.")) {
                event.preventDefault();
              }
            }}
          >
            Delete
          </Button>
        )}
      </FormActions>
    </Form>
  );
}
