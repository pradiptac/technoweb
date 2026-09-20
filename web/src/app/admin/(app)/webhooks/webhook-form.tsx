"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { FormActions } from "@/components/admin/form-actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { SecretOnce } from "./secret-once";
import {
  createWebhookAction, deleteWebhookAction, updateWebhookAction, type WebhookFormState,
} from "./actions";
import type { AdminWebhook, WebhookEventOption } from "@/types/api";

const initial: WebhookFormState = {};

/**
 * One form for both screens. The event checkboxes come from `meta.events`
 * on the API's own index — never a list in TypeScript — so a new event is
 * offered the day the enum gains it.
 *
 * Two things happen here that a plain CRUD form does not. After a **create**
 * the form is replaced by the secret, because the secret is on that response
 * and on no other. And **Rotate secret** is a second submit button on the
 * edit form (`name="rotate_secret"`), so rotating also saves whatever else
 * was typed and the new secret arrives in the same state the form already
 * reads — one action, one shape.
 */
export function WebhookForm({
  webhook, events,
}: {
  webhook?: AdminWebhook;
  events: WebhookEventOption[];
}) {
  const editing = Boolean(webhook);
  const [state, formAction, pending] = useActionState(
    editing ? updateWebhookAction : createWebhookAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const ticked = new Set(webhook?.events ?? []);

  // After a successful create the form gives way to the secret, which cannot
  // be retrieved again.
  if (!editing && state.secret) {
    return (
      <>
        <SecretOnce secret={state.secret} name={state.savedName} />
        <div className="flex flex-wrap gap-3">
          {state.savedId && (
            <ButtonLink href={`/admin/webhooks/${state.savedId}`} size="sm">Open the webhook</ButtonLink>
          )}
          <Link href="/admin/webhooks" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
            Back to the list
          </Link>
        </div>
      </>
    );
  }

  return (
    <Form action={formAction} state={state} noValidate>
      {editing && <input type="hidden" name="id" value={webhook!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {editing && state.secret && <SecretOnce secret={state.secret} name={webhook!.name} />}

      <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Field label="Name" htmlFor="name" error={err("name")} hint="For the list. The receiving system never sees it.">
            <Input id="name" name="name" defaultValue={webhook?.name} required aria-invalid={Boolean(err("name"))} />
          </Field>

          <Field label="URL" htmlFor="url" error={err("url")}
            hint="https:// only, at a public host. Every event is POSTed here as JSON, signed with the secret.">
            <Input id="url" name="url" type="url" inputMode="url" defaultValue={webhook?.url} required
              placeholder="https://example.com/hooks/technoware" aria-invalid={Boolean(err("url"))} />
          </Field>

          <fieldset className="mb-[18px]">
            <legend className="mb-[7px] block text-13-5 font-semibold">Events</legend>
            <p className="mb-3 text-12-5 text-faint">
              What this hook is told about. Each is the record as the console
              reads it — never an internal note, never a customer&apos;s status note.
            </p>
            {(err("events") || err("events.0")) && (
              <p className="mb-2 text-12-5 text-err">{err("events") ?? err("events.0")}</p>
            )}

            <ul className="grid gap-2 sm:grid-cols-2">
              {events.map((event) => (
                <li key={event.value}>
                  <label className="flex h-full cursor-pointer gap-2.5 rounded border border-line-strong bg-card p-3 hover:border-faint">
                    <input
                      type="checkbox" name="events" value={event.value}
                      defaultChecked={ticked.has(event.value)}
                      className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-13-5 font-semibold">{event.label}</span>
                      <span className="block font-mono text-11-5 text-faint">{event.value}</span>
                      <span className="mt-1 block text-12-5 text-muted">{event.blurb}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        </div>

        <aside className="grid content-start gap-0">
          <Field label="Active" htmlFor="is_active" error={err("is_active")}
            hint="Switched off, nothing is queued for it and anything still waiting is marked failed." variant="float-static">
            <Select
              id="is_active" name="is_active" defaultValue={webhook?.is_active === false ? "0" : "1"}
              aria-invalid={Boolean(err("is_active"))}
            >
              <option value="1">Yes</option>
              <option value="0">No</option>
            </Select>
          </Field>

          <div className="mb-[18px] rounded border border-line-strong bg-card p-3 text-12-5 leading-[1.5] text-muted">
            <p className="mb-1 text-13 font-semibold text-ink">Verifying a delivery</p>
            <p>
              Every request carries <code className="font-mono">X-Technoware-Timestamp</code> and{" "}
              <code className="font-mono">X-Technoware-Signature: sha256=…</code>, an HMAC-SHA256
              over <code className="font-mono">timestamp + &quot;.&quot; + body</code> with the secret —
              the body exactly as received, not re-encoded. Anything but a 2xx is retried
              five times over about fourteen hours.
            </p>
          </div>

          {editing && (
            <div className="mb-[18px] rounded border border-warn/25 bg-warn-soft p-3 text-12-5 leading-[1.5] text-warn">
              <p className="mb-2">
                {webhook!.has_secret ? "A secret is set and cannot be read back." : "No secret is set."} Rotating
                mints a new one, shows it once, and the old one stops verifying at once.
              </p>
              <Button
                type="submit" size="sm" variant="warn" name="rotate_secret" value="1" formNoValidate
                onClick={(e) => {
                  if (!window.confirm("Rotate the secret? Deliveries signed with the old one will fail verification at the other end until it is updated there.")) e.preventDefault();
                }}
              >
                Rotate secret
              </Button>
            </div>
          )}
        </aside>
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create webhook"}
        </Button>
        <Link href="/admin/webhooks" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
        {editing && (
          <span className="ml-auto">
            <Button
              type="submit" variant="destructive" size="sm"
              formAction={deleteWebhookAction} formNoValidate
              onClick={(e) => {
                if (!window.confirm(`Delete ${webhook!.name}? Its delivery log goes with it. This cannot be undone.`)) e.preventDefault();
              }}
            >
              Delete webhook
            </Button>
          </span>
        )}
      </FormActions>
    </Form>
  );
}
