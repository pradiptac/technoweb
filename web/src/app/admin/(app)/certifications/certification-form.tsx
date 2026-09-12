"use client";

import { useActionState } from "react";

import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CoverField } from "@/components/admin/cover-field";
import { DocumentField } from "@/components/admin/document-field";
import { FormActions } from "@/components/admin/form-actions";
import { createCertificationAction, updateCertificationAction, type CertificationState } from "./actions";
import type { AdminCertification } from "@/types/api";

const initial: CertificationState = {};

/**
 * Single pane, like a brand: nine fields, where tabs would be chrome rather
 * than structure. The badge and the PDF go through the media library, and
 * the form posts paths back while previewing from URLs.
 */
export function CertificationForm({ certification }: { certification?: AdminCertification }) {
  const action = certification ? updateCertificationAction.bind(null, certification.id) : createCertificationAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const err = (field: string) => state.fieldErrors?.[field]?.[0];

  return (
    <Form action={formAction} state={state}>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
        <div>
          <Field label="Name" htmlFor="name" error={err("name")} hint="What the certificate says — “ISO 9001:2015”, “MSME Udyam registration”.">
            <Input id="name" name="name" defaultValue={certification?.name} required maxLength={150} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Issued by" htmlFor="issuer" error={err("issuer")}>
              <Input id="issuer" name="issuer" defaultValue={certification?.issuer ?? ""} maxLength={150} />
            </Field>
            <Field label="Certificate number" htmlFor="certificate_number" error={err("certificate_number")}>
              <Input id="certificate_number" name="certificate_number" defaultValue={certification?.certificate_number ?? ""} maxLength={100} className="font-mono" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Issued on" htmlFor="issued_on" variant="float-static" error={err("issued_on")}>
              <Input id="issued_on" name="issued_on" type="date" defaultValue={certification?.issued_on ?? ""} />
            </Field>
            <Field
              label="Valid until"
              htmlFor="valid_until"
              variant="float-static"
              error={err("valid_until")}
              hint="Optional. Once this date passes the certificate comes off the public page by itself and shows here as expired."
            >
              <Input id="valid_until" name="valid_until" type="date" defaultValue={certification?.valid_until ?? ""} />
            </Field>
          </div>

          <Field label="Description" htmlFor="description" error={err("description")} hint="A sentence on what the certificate covers. Plain text.">
            <Textarea id="description" name="description" rows={3} defaultValue={certification?.description ?? ""} maxLength={1000} />
          </Field>

          <DocumentField
            name="file_path"
            label="Certificate (PDF)"
            hint="Optional. Linked from the public page as “View certificate”. It is a public document."
            defaultPath={certification?.file_path ?? null}
            defaultName={certification?.file_path?.split("/").pop() ?? null}
            error={err("file_path")}
          />
        </div>

        <aside>
          <Field label="Status" htmlFor="status" variant="float-static" error={err("status")}>
            <Select id="status" name="status" defaultValue={certification?.status ?? "draft"}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>

          <Field label="Order" htmlFor="sort_order" error={err("sort_order")} hint="Lower numbers first.">
            <Input id="sort_order" name="sort_order" type="number" min={0} max={65535} defaultValue={certification?.sort_order ?? 0} />
          </Field>

          <CoverField
            name="image_path"
            label="Badge"
            defaultPath={certification?.image_path ?? null}
            defaultUrl={certification?.image ?? null}
            hint="The issuer's badge or a picture of the certificate. Square reads best; SVG or PNG with a transparent background."
          />
        </aside>
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : certification ? "Save certification" : "Create certification"}
        </Button>
      </FormActions>
    </Form>
  );
}
