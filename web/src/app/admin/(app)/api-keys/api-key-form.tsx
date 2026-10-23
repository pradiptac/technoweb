"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { FormActions } from "@/components/admin/form-actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { SecretOnce } from "@/components/admin/secret-once";
import { createApiKeyAction, updateApiKeyAction, type ApiKeyFormState } from "./actions";
import { CurlExample } from "./curl-example";
import type { AdminApiKey, ApiScopeOption } from "@/types/api-keys";

const initial: ApiKeyFormState = {};

const EXPIRIES = [
  ["never", "Never"], ["30", "In 30 days"], ["90", "In 90 days"], ["365", "In a year"], ["date", "On a date"],
] as const;

/**
 * One form for both screens. The permission grid comes from `meta.scopes` on
 * the API's own index — never a list in TypeScript — so a new permission is
 * offered the day the enum gains it.
 *
 * After a **create** the form is replaced by the key, because the key is on
 * that response and on no other (the webhook secret's shape). A revoked key
 * is shown read-only: the API refuses every change to one.
 *
 * The expiry is a choice plus a date. "In N days" is turned into an instant
 * by the action; an edit carries the stored expiry as `expires_current`, so a
 * date left alone is sent back as it was.
 */
export function ApiKeyForm({
  apiKey, scopes, baseUrl,
}: {
  apiKey?: AdminApiKey;
  scopes: ApiScopeOption[];
  baseUrl: string;
}) {
  const editing = Boolean(apiKey);
  const revoked = apiKey?.status === "revoked";
  const [state, formAction, pending] = useActionState(
    editing ? updateApiKeyAction : createApiKeyAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const ticked = new Set(apiKey?.scopes ?? []);
  const expiresOn = apiKey?.expires_at?.slice(0, 10) ?? "";

  if (!editing && state.key) {
    return (
      <>
        <SecretOnce
          secret={state.key} name={state.savedName} label="API key"
          lost="roll it from its screen and update the system that uses it"
        />
        <CurlExample baseUrl={baseUrl} keyText={state.key} />
        <div className="flex flex-wrap gap-3">
          {state.savedId && (
            <ButtonLink href={`/admin/api-keys/${state.savedId}`} size="sm">Open the key</ButtonLink>
          )}
          <Link href="/admin/api-keys" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
            Back to the list
          </Link>
        </div>
      </>
    );
  }

  return (
    <Form action={formAction} state={state} noValidate>
      {editing && <input type="hidden" name="id" value={apiKey!.id} />}
      {apiKey?.expires_at && <input type="hidden" name="expires_current" value={apiKey.expires_at} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {revoked && (
        <Alert tone="warn" dismissible={false} title="This key is revoked">
          It no longer works and cannot be changed or rolled. Make a new key to replace it.
        </Alert>
      )}

      <fieldset disabled={revoked} className="min-w-0">
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Name" htmlFor="name" error={err("name")} hint="For the list — say what uses it, such as “CRM sync”.">
              <Input id="name" name="name" defaultValue={apiKey?.name} required maxLength={120} aria-invalid={Boolean(err("name"))} />
            </Field>

            <fieldset className="mb-[18px]">
              <legend className="mb-[7px] block text-13-5 font-semibold">Permissions</legend>
              <p className="mb-3 text-12-5 text-faint">
                What the key may do. Tick only what the other system needs; a key
                can never do anything that is not ticked here.
              </p>
              {(err("scopes") || err("scopes.0")) && (
                <p className="mb-2 text-12-5 text-err">{err("scopes") ?? err("scopes.0")}</p>
              )}

              <ul className="grid gap-2 sm:grid-cols-2">
                {scopes.map((scope) => (
                  <li key={scope.value}>
                    <label className="flex h-full cursor-pointer gap-2.5 rounded border border-line-strong bg-card p-3 hover:border-faint">
                      <input
                        type="checkbox" name="scopes" value={scope.value}
                        defaultChecked={ticked.has(scope.value)}
                        className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-13-5 font-semibold">{scope.label}</span>
                        <span className="block font-mono text-11-5 text-faint">{scope.value}</span>
                        <span className="mt-1 block text-12-5 text-muted">{scope.blurb}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          </div>

          <aside className="grid content-start gap-0">
            <Field label="Expires" htmlFor="expiry" variant="float-static" error={err("expires_at")}
              hint="After this the key stops working. “On a date” ends at the close of that day.">
              <Select id="expiry" name="expiry" defaultValue={expiresOn ? "date" : "never"}>
                {EXPIRIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Date" htmlFor="expires_on" hint="Used only when “On a date” is chosen.">
              <Input id="expires_on" name="expires_on" type="date" defaultValue={expiresOn} />
            </Field>

            <Field label="Allowed addresses" htmlFor="allowed_ips" error={err("allowed_ips")}
              hint="Optional. One IP address or range (203.0.113.0/24) per line. Blank means the key works from anywhere.">
              <Textarea id="allowed_ips" name="allowed_ips" rows={4} className="font-mono"
                defaultValue={apiKey?.allowed_ips.join("\n")} aria-invalid={Boolean(err("allowed_ips"))} />
            </Field>

            <CurlExample baseUrl={baseUrl} />
          </aside>
        </div>
      </fieldset>

      <FormActions>
        {!revoked && (
          <Button type="submit" pending={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Create key"}
          </Button>
        )}
        <Link href="/admin/api-keys" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
          {revoked ? "Back to the list" : "Cancel"}
        </Link>
      </FormActions>
    </Form>
  );
}
