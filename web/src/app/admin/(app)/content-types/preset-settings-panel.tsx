"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import type { PresetKey, PresetSetting, PresetSettingsMeta } from "@/types/presets";
import { savePresetSettingsAction, type PresetFormState } from "./preset-actions";

/**
 * A preset type's own settings (docs/content-presets.md): the newsroom's
 * boilerplate, press contact and media kit, or the investors page's contact
 * and signup line. Its own form beside the type's — a form cannot sit inside
 * another — saved through the content manager's narrow settings door.
 */
const COPY: Record<string, { label: string; hint?: string; multiline?: boolean; type?: string }> = {
  newsroom_boilerplate: { label: "About the company", hint: "The paragraph at the end of every release and in the media kit.", multiline: true },
  newsroom_contact_name: { label: "Press contact" },
  newsroom_contact_email: { label: "Press contact email", type: "email" },
  newsroom_contact_phone: { label: "Press contact phone", type: "tel" },
  newsroom_kit_category_id: { label: "Media kit files", hint: "A downloads category whose files are listed in the media kit." },
  investors_contact_name: { label: "Investor contact", hint: "Often the company secretary." },
  investors_contact_email: { label: "Investor contact email", type: "email" },
  investors_contact_phone: { label: "Investor contact phone", type: "tel" },
  investors_signup_line: { label: "Signup line", hint: "The sentence above the email alert signup. Blank for the default." },
};

export function PresetSettingsPanel({ typeId, preset, rows, meta }: {
  typeId: number;
  preset: PresetKey;
  rows: PresetSetting[];
  meta: PresetSettingsMeta;
}) {
  const [state, action, pending] = useActionState<PresetFormState, FormData>(savePresetSettingsAction, {});
  const err = (key: string) => state.fieldErrors?.[`setting__${key}`]?.[0];

  return (
    <Card as="section" interactive={false} padding="lg" className="mt-8">
      <h2 className="text-16-5 font-semibold text-ink">{preset === "investors" ? "Investors page" : "Newsroom"}</h2>
      <p className="measure mb-5 mt-1 text-13-5 text-muted">What the page draws besides its entries.</p>

      <Form action={action} state={state}>
        <input type="hidden" name="type_id" value={typeId} />
        <input type="hidden" name="keys" value={rows.map((r) => r.key).join(",")} />
        {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
        {state.ok && <Alert tone="ok" title={state.ok} />}

        <div className="grid gap-x-6 md:grid-cols-2">
          {rows.map((row) => {
            const copy = COPY[row.key] ?? { label: row.key };
            const id = `setting__${row.key}`;
            if (row.key === "newsroom_kit_category_id") {
              return (
                <Field key={row.key} label={copy.label} htmlFor={id} hint={copy.hint} error={err(row.key)} variant="float-static">
                  <Select id={id} name={id} defaultValue={row.value ?? ""}>
                    <option value="">No media kit</option>
                    {(meta.download_categories ?? []).map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                  </Select>
                </Field>
              );
            }
            if (copy.multiline) {
              return (
                <div key={row.key} className="md:col-span-2">
                  <EditorField name={id} label={copy.label} defaultValue={row.value ?? ""} hint={copy.hint} error={err(row.key)} />
                </div>
              );
            }
            return (
              <div key={row.key}>
                <Field label={copy.label} htmlFor={id} hint={copy.hint} error={err(row.key)}>
                  <Input id={id} name={id} type={copy.type ?? "text"} defaultValue={row.value ?? ""} />
                </Field>
              </div>
            );
          })}
        </div>

        <Button type="submit" size="sm" pending={pending}>Save</Button>
      </Form>
    </Card>
  );
}
