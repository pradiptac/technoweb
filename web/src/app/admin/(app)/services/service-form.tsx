"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { FormDraft } from "@/components/admin/form-draft";
import { FormActions } from "@/components/admin/form-actions";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { StringListField } from "@/components/admin/string-list-field";
import { FaqField } from "@/components/admin/faq-field";
import { IconField } from "@/components/admin/icon-field-lazy";
import { CoverField } from "@/components/admin/cover-field";
import { AeoGeoPanel } from "@/components/admin/aeo-geo-panel";
import { AnswerBlocksField } from "@/components/admin/answer-blocks-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { BodyReplacedNote, RecordSectionsPanel, SECTIONS_TAB, useRecordSections } from "../pages/builder/record-sections";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { CustomFieldsPanel, customFieldError, withFieldsTab } from "@/components/admin/custom-fields-panel";
import {
  createServiceAction, updateServiceAction, deleteServiceAction, type ServiceFormState,
} from "./actions";
import type { CustomFieldGroupDefinition, AdminService, AnswerBlockKindOption, PageBuilderOptions } from "@/types/api";
import { RecordSwitch } from "@/components/admin/record-switch";

const initial: ServiceFormState = {};

/** Four panels; the field lists map a 422 back to the tab holding it. */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["title", "slug", "summary", "highlights", "body", "status", "service_category_id", "sort_order", "show_in_menu"] },
  // Sections in place of the written body (0.129.0) — the choice and the builder.
  SECTIONS_TAB,
  { id: "media", label: "Media", fields: ["icon", "image_path"] },
  { id: "related", label: "Related", fields: ["faqs"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
  // The AEO tab (docs/aeo-geo-contract.md §7). Last, so every tab above keeps its place.
  { id: "aeo", label: "AEO", fields: ["answer_blocks"] },
];

export function ServiceForm({
  service, saved, kinds, fieldGroups, categories = [], builder,
}: {
  service?: AdminService;
  /** The service categories, for the Category select. */
  categories?: { id: number; name: string }[];
  saved?: boolean;
  /** `meta.answer_block_kinds` from this entity's admin index. */
  kinds: AnswerBlockKindOption[];
  /** `meta.custom_field_groups` from the index, for a new record; an edit reads the record's own. */
  fieldGroups?: CustomFieldGroupDefinition[];
  /** `GET /admin/pages/builder` — the section builder's types and pickers, for the Sections tab. */
  builder: PageBuilderOptions;
}) {
  const editing = Boolean(service);
  const [state, formAction, pending] = useActionState(
    editing ? updateServiceAction : createServiceAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];
  const rowErr = (prefix: string) =>
    err(prefix) ?? Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith(`${prefix}.`))?.[1]?.[0];

  // The body area: the written body, or builder sections (0.129.0).
  const body = useRecordSections(service);

  // Custom fields (docs/custom-content.md): the groups that apply, from the API.
  const customGroups = service?.custom_field_groups ?? fieldGroups ?? [];
  const { tabs, jumpTo } = buildFormTabs(withFieldsTab(GROUPS, customGroups), state.fieldErrors);

  return (
    <Form action={formAction} state={state} noValidate>
      {/* A draft in localStorage, offered back after a refresh or a crash. */}
      <FormDraft />
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
              <Input id="slug" name="slug" defaultValue={service?.slug} className="font-mono text-14" />
            </Field>

            <Field label="Summary" htmlFor="summary" error={err("summary")}
              hint="One or two sentences, shown on the services index and in the header menu. Max 500 characters.">
              <Textarea id="summary" name="summary" rows={3} defaultValue={service?.summary ?? ""} maxLength={500} />
            </Field>

            <StringListField
              name="highlights"
              label="Highlights"
              hint="A few words each, drawn as small tags on the service's card — “.com”, “Microsoft 365”, “Wi-Fi 6”. Up to six."
              placeholder="Microsoft 365"
              defaultValue={service?.highlights ?? []}
              error={err("highlights") ?? Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith("highlights."))?.[1]?.[0]}
              max={6}
              maxLength={40}
            />

            <BodyReplacedNote state={body} />

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

            <Field label="Category" htmlFor="service_category_id" error={err("service_category_id")}
              hint="The tab it is listed under on the homepage and on /services." variant="float-static">
              <Select
                id="service_category_id" name="service_category_id"
                defaultValue={service?.service_category_id ? String(service.service_category_id) : ""}
                aria-invalid={Boolean(err("service_category_id"))}
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>

            <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")}
              hint="Lower numbers come first on the index and in the menu.">
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={service?.sort_order ?? 0} />
            </Field>


            {/*
              Separate from status on purpose. Publishing decides whether a page exists;
              this decides whether the mega menu points at it. A catalogue outgrows a
              navigation long before it outgrows itself.
            */}
            <RecordSwitch className="mb-[18px]" name="show_in_menu" defaultChecked={service?.show_in_menu ?? true} label="Show in the main menu"
              hint="Switched off, it stays published and listed on the services index and just drops out of the header navigation." />
          </aside>
        </div>

        {/* Sections in place of the written body. One child, always mounted. */}
        <RecordSectionsPanel
          state={body}
          builder={builder}
          media={service?.blocks_media ?? {}}
          errors={state.fieldErrors ?? {}}
          bodyField="body"
          storedBody={service?.body ?? ""}
          noun="service"
        />

        <div className="grid gap-x-8 md:grid-cols-2">
          <IconField defaultValue={service?.icon ?? null} error={err("icon")} />

          <CoverField
            label="Service picture"
            name="image_path"
            hint="PNG, JPG or WebP, landscape, around 1600 x 1000 px. Shown on the service's card — as the whole card where its category draws pictures as backgrounds."
            defaultPath={service?.image_path ?? null}
            defaultUrl={service?.image ?? null}
          />
        </div>

        <div>
          <FaqField defaultValue={service?.faqs ?? []} error={rowErr("faqs")} />
        </div>

        <SeoPanel seo={service?.seo} defaults={service?.seo_defaults} error={seoErr} embedded record={service ? { type: 'service', id: service.id } : null} />

        {/*
          The AEO tab, one child: the readiness scores and the assistant on
          top, the answer blocks under them. See docs/aeo-geo-contract.md §7.
        */}
        <div>
          <AeoGeoPanel record={service ? { type: 'service', id: service.id } : null} blocks={service?.answer_blocks} />
          <AnswerBlocksField defaultValue={service?.answer_blocks ?? []} kinds={kinds} error={rowErr("answer_blocks")} />
        </div>

        {/* The Fields tab — last, and only when a custom field group applies. */}
        {customGroups.length > 0 && (
          <CustomFieldsPanel groups={customGroups} values={service?.custom_fields} media={service?.custom_field_media}
            error={customFieldError(state.fieldErrors)} />
        )}
      </Tabs>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create service"}
        </Button>
        <Link href="/admin/services" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
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
      </FormActions>
    </Form>
  );
}
