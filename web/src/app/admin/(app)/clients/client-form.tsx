"use client";

import { useActionState } from "react";

import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CoverField } from "@/components/admin/cover-field";
import { FormActions } from "@/components/admin/form-actions";
import { createClientAction, updateClientAction, type ClientState } from "./actions";
import type { AdminClient } from "@/types/api";

const initial: ClientState = {};

export function ClientForm({
  client, industries,
}: {
  client?: AdminClient;
  industries: { id: number; name: string }[];
}) {
  const action = client ? updateClientAction.bind(null, client.id) : createClientAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const err = (field: string) => state.fieldErrors?.[field]?.[0];

  return (
    <Form action={formAction} state={state}>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
        <div>
          <Field label="Name" htmlFor="name" error={err("name")}>
            <Input id="name" name="name" defaultValue={client?.name} required maxLength={150} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Website"
              htmlFor="website_url"
              error={err("website_url")}
              hint="Optional. A full https:// address; the logo on the site links to it in a new tab."
            >
              <Input id="website_url" name="website_url" type="url" defaultValue={client?.website_url ?? ""} placeholder="https://" />
            </Field>

            <Field label="Industry" htmlFor="industry_id" variant="float-static" error={err("industry_id")}>
              <Select id="industry_id" name="industry_id" defaultValue={client?.industry_id ?? ""}>
                <option value="">Not said</option>
                {industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="Note" htmlFor="note" error={err("note")} hint="One line under the logo — what was done for them. Plain text, 200 characters.">
            <Textarea id="note" name="note" rows={2} defaultValue={client?.note ?? ""} maxLength={200} />
          </Field>
        </div>

        <aside>
          <Field label="Status" htmlFor="status" variant="float-static" error={err("status")}>
            <Select id="status" name="status" defaultValue={client?.status ?? "draft"}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>

          <label className="mb-[18px] flex items-start gap-2.5 text-13-5">
            <input type="checkbox" name="is_featured" defaultChecked={client?.is_featured ?? false} className="mt-1 size-4 accent-brand-600" />
            <span>
              <span className="block font-semibold">Featured</span>
              <span className="block text-12-5 text-muted">On the homepage strip and the About page. With none ticked, the first twelve are shown.</span>
            </span>
          </label>

          <Field label="Order" htmlFor="sort_order" error={err("sort_order")} hint="Lower numbers first.">
            <Input id="sort_order" name="sort_order" type="number" min={0} max={65535} defaultValue={client?.sort_order ?? 0} />
          </Field>

          <CoverField
            name="logo_path"
            label="Logo"
            defaultPath={client?.logo_path ?? null}
            defaultUrl={client?.logo ?? null}
            hint="SVG or PNG with a transparent background. It is shown contained, never cropped, and as a white silhouette in dark mode."
          />
        </aside>
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : client ? "Save client" : "Create client"}
        </Button>
      </FormActions>
    </Form>
  );
}
