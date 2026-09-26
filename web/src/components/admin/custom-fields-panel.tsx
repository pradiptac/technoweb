"use client";

import { useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import { DocumentField } from "@/components/admin/document-field";
import { EditorField } from "@/components/admin/editor-field";
import { StringListField } from "@/components/admin/string-list-field";
import type { TabGroup } from "@/components/admin/form-tabs";
import type { CustomFieldDefinition, CustomFieldGroupDefinition } from "@/types/api";

/**
 * The Fields tab, appended **last** and only when a group applies.
 *
 * Last because `Tabs` reads its children positionally: a tab that comes and
 * goes in the middle would shift every panel after it onto the wrong tab,
 * and a trailing `false` child is simply never read.
 */
export function withFieldsTab(tabs: TabGroup[], groups: CustomFieldGroupDefinition[]): TabGroup[] {
  return groups.length > 0 ? [...tabs, { id: "fields", label: "Fields", fields: ["custom_fields"] }] : tabs;
}

/** The first message under `custom_fields.<key>`, or under a row of it. */
export function customFieldError(fieldErrors: Record<string, string[]> | undefined) {
  return (key: string): string | undefined => {
    const exact = fieldErrors?.[`custom_fields.${key}`]?.[0];
    if (exact) return exact;
    return Object.entries(fieldErrors ?? {}).find(([k]) => k.startsWith(`custom_fields.${key}.`))?.[1]?.[0];
  };
}

/**
 * The Fields tab every entity form shares (docs/custom-content.md).
 *
 * It draws the custom field groups that apply to the record — definitions
 * from the API, never listed here — with the console's own primitives, one
 * per kind. Every control is named `cf__<key>`, and one hidden
 * `custom_fields_schema` says which keys and kinds were drawn, so
 * `customFieldsFromFormData()` can read them back into the `custom_fields`
 * object the API takes. The controls are the ordinary named inputs rather
 * than a single hidden JSON value, because that is what `<Form>` restores
 * after a refusal and what `FormDraft` keeps — a hidden JSON built from
 * state would be one value neither of them could put back.
 *
 * Its tab's field list is `["custom_fields"]`, so a 422 on
 * `custom_fields.warranty` lands here (`buildFormTabs`) and the message is
 * drawn under the field it names.
 */
export function CustomFieldsPanel({
  groups, values, media, error,
}: {
  groups: CustomFieldGroupDefinition[];
  values?: Record<string, unknown>;
  media?: Record<string, string>;
  /** The first message under `custom_fields.<key>` (or a row under it). */
  error: (key: string) => string | undefined;
}) {
  const schema = groups.flatMap((g) => g.fields.map((f) => ({ key: f.key, kind: f.kind })));

  return (
    <div>
      <input type="hidden" name="custom_fields_schema" value={JSON.stringify(schema)} />

      {groups.map((group) => (
        <fieldset key={group.id} className="mb-6 rounded-lg border border-line-strong bg-card p-4 sm:p-5">
          <legend className="px-1 text-14 font-semibold">{group.name}</legend>
          <p className="mb-4 text-12-5 text-faint">
            {group.placement === "details"
              ? "Drawn as a Details section on the public page, for the fields marked to show."
              : "Not drawn on the page. Still in the public API — never put anything private here."}
          </p>

          <div className="grid gap-x-6 md:grid-cols-2">
            {group.fields.map((field) => (
              <div key={field.id} className={wide(field) ? "md:col-span-2" : undefined}>
                <Control field={field} value={values?.[field.key]} url={media?.[field.key] ?? null} error={error(field.key)} />
              </div>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

/** The kinds that want the whole row. */
function wide(field: CustomFieldDefinition): boolean {
  return ["textarea", "rich_text", "multi_select", "list", "image", "file"].includes(field.kind);
}

function hintFor(field: CustomFieldDefinition): string | undefined {
  const parts = [field.help ?? ""];
  if (field.kind === "relation" && field.choices.length >= 200) parts.push("The first 200 are listed.");
  if (!field.show_on_page) parts.push("Not drawn on the page.");
  return parts.filter(Boolean).join(" ") || undefined;
}

function asString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function Control({
  field, value, url, error,
}: {
  field: CustomFieldDefinition;
  value: unknown;
  url: string | null;
  error?: string;
}) {
  const name = `cf__${field.key}`;
  const id = `cf-${field.key}`;
  const label = field.required ? `${field.label} *` : field.label;
  const hint = hintFor(field);

  switch (field.kind) {
    case "textarea":
      return (
        <Field label={label} htmlFor={id} error={error} hint={hint}>
          <Textarea id={id} name={name} rows={4} defaultValue={asString(value)} aria-invalid={Boolean(error)} />
        </Field>
      );

    case "rich_text":
      return <EditorField name={name} label={label} defaultValue={asString(value)} error={error} hint={hint} />;

    case "number":
      return (
        <Field label={label} htmlFor={id} error={error} hint={hint}>
          <Input id={id} name={name} type="number" step="any" defaultValue={asString(value)}
            min={field.settings.min ?? undefined} max={field.settings.max ?? undefined}
            aria-invalid={Boolean(error)} />
        </Field>
      );

    case "date":
      return (
        <Field label={label} htmlFor={id} error={error} hint={hint} variant="float-static">
          <Input id={id} name={name} type="date" defaultValue={asString(value)} aria-invalid={Boolean(error)} />
        </Field>
      );

    case "url":
    case "email":
      return (
        <Field label={label} htmlFor={id} error={error} hint={hint}>
          <Input id={id} name={name} type={field.kind} defaultValue={asString(value)} aria-invalid={Boolean(error)} />
        </Field>
      );

    case "select":
      return (
        <Field label={label} htmlFor={id} error={error} hint={hint} variant="float-static">
          <Select id={id} name={name} defaultValue={asString(value)} aria-invalid={Boolean(error)}>
            <option value="">—</option>
            {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      );

    case "relation":
      return (
        <Field label={label} htmlFor={id} error={error} hint={hint} variant="float-static">
          <Select id={id} name={name} defaultValue={asString(value)} aria-invalid={Boolean(error)}>
            <option value="">—</option>
            {field.choices.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      );

    case "multi_select":
      return <Checkboxes field={field} name={name} label={label} hint={hint} value={value} error={error} />;

    case "boolean":
      return <Switch field={field} name={name} value={value} hint={hint} error={error} />;

    case "image":
      return (
        <div className="mb-[18px]">
          <CoverField name={name} label={label} hint={hint ?? "PNG, JPG, GIF, WebP or SVG from the media library."}
            defaultPath={typeof value === "string" ? value : null} defaultUrl={url} className="mb-0" />
          {error && <p className="mt-1 text-12-5 text-err">{error}</p>}
        </div>
      );

    case "file":
      return (
        <DocumentField name={name} label={label} hint={hint} error={error}
          defaultPath={typeof value === "string" ? value : null}
          defaultName={typeof value === "string" ? value.split("/").pop() : null} />
      );

    case "list":
      return (
        <StringListField name={name} label={label} hint={hint} placeholder=""
          defaultValue={Array.isArray(value) ? value.map(String) : []} error={error} />
      );

    default:
      return (
        <Field label={label} htmlFor={id} error={error} hint={hint}>
          <Input id={id} name={name} defaultValue={asString(value)}
            maxLength={field.settings.max_length ?? 255} aria-invalid={Boolean(error)} />
        </Field>
      );
  }
}

function Checkboxes({
  field, name, label, hint, value, error,
}: {
  field: CustomFieldDefinition;
  name: string;
  label: string;
  hint?: string;
  value: unknown;
  error?: string;
}) {
  const [checked, setChecked] = useState<string[]>(Array.isArray(value) ? value.map(String) : []);

  return (
    <fieldset className="mb-[18px]">
      <legend className="mb-[7px] text-13-5 font-semibold">{label}</legend>
      {hint && <p className="mb-2.5 text-12-5 text-faint">{hint}</p>}
      <ul className="grid gap-1.5 rounded border border-line-strong bg-card p-3 sm:grid-cols-2">
        {field.options.map((o) => (
          <li key={o.value}>
            <label className="flex items-start gap-2 text-13-5">
              <input
                type="checkbox" name={name} value={o.value} className="mt-[3px]"
                checked={checked.includes(o.value)}
                onChange={() => setChecked((c) => (c.includes(o.value) ? c.filter((v) => v !== o.value) : [...c, o.value]))}
              />
              <span className="min-w-0">{o.label}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="mt-1 text-12-5 text-err">{error}</p>}
    </fieldset>
  );
}

function Switch({
  field, name, value, hint, error,
}: {
  field: CustomFieldDefinition;
  name: string;
  value: unknown;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="mb-[18px]">
      {/* The hidden "0" first: an unticked box submits nothing, and absence
          must still mean "no" rather than "leave alone". */}
      <input type="hidden" name={name} value="0" />
      <label className="flex items-start gap-2 text-13-5">
        <input type="checkbox" name={name} value="1" className="mt-0.5" defaultChecked={value === true} />
        <span>
          {field.label}
          {hint && <span className="mt-0.5 block text-12-5 text-faint">{hint}</span>}
        </span>
      </label>
      {error && <p className="mt-1 text-12-5 text-err">{error}</p>}
    </div>
  );
}
