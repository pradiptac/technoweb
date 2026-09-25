"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { FormActions } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { saveBroadcastAction, sendBroadcastAction, type MessagingFormState } from "../actions";
import type { MessageBroadcast, MessageBroadcastMeta, MessageChannelValue } from "@/types/api";

const initial: MessagingFormState = {};

/**
 * Compose: a name, a channel, a template on that channel, and who it goes to.
 * The audience's lists — newsletter groups, shop products — come from the
 * API's `meta`, and the channel filters the templates so a WhatsApp
 * broadcast cannot be pointed at a push template.
 */
export function BroadcastForm({ broadcast, meta }: { broadcast?: MessageBroadcast; meta: MessageBroadcastMeta }) {
  const [state, formAction, pending] = useActionState(saveBroadcastAction, initial);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const [channel, setChannel] = useState<MessageChannelValue>(broadcast?.channel ?? "whatsapp");
  const [audience, setAudience] = useState<string>(broadcast?.audience ?? "opt_ins");
  const templates = meta.templates.filter((t) => t.channel === channel);
  const chosenAudience = meta.audiences.find((a) => a.value === audience);

  return (
    <Form action={formAction} state={state} noValidate>
      {broadcast && <input type="hidden" name="id" value={broadcast.id} />}
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" error={err("name")} hint="For the console; nobody receives it.">
          <Input id="name" name="name" defaultValue={broadcast?.name} required />
        </Field>
        <Field label="Channel" htmlFor="channel" error={err("channel")} variant="float-static">
          <Select id="channel" name="channel" value={channel} onChange={(e) => setChannel(e.target.value as MessageChannelValue)}>
            {meta.channels.map((c) => <option key={c.value} value={c.value}>{c.label}{c.ready ? "" : " — not configured"}</option>)}
          </Select>
        </Field>
        <Field label="Template" htmlFor="message_template_id" error={err("message_template_id")} variant="float-static"
          hint={templates.length === 0 ? "No template on this channel yet — write one under Templates." : "WhatsApp sends only an approved template."}>
          <Select id="message_template_id" name="message_template_id" key={channel} defaultValue={broadcast?.channel === channel ? (broadcast?.message_template_id ?? "") : ""}>
            <option value="">Choose…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.sendable ? "" : ` (${t.approval_label.toLowerCase()})`}</option>)}
          </Select>
        </Field>
        <Field label="Audience" htmlFor="audience" error={err("audience")} variant="float-static" hint={chosenAudience?.blurb}>
          <Select id="audience" name="audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
            {meta.audiences.map((a) => (
              <option key={a.value} value={a.value} disabled={a.value === "wishlist" && !meta.wishlists}>
                {a.label}{a.value === "wishlist" && !meta.wishlists ? " — not available yet" : ""}
              </option>
            ))}
          </Select>
        </Field>
        {audience === "newsletter_group" && (
          <Field label="Newsletter group" htmlFor="newsletter_group_id" error={err("newsletter_group_id")} variant="float-static">
            <Select id="newsletter_group_id" name="newsletter_group_id" defaultValue={broadcast?.newsletter_group_id ?? ""}>
              <option value="">Choose…</option>
              {meta.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
        )}
        {audience === "wishlist" && (
          <Field label="Product on their wishlist" htmlFor="store_product_id" error={err("store_product_id")} variant="float-static">
            <Select id="store_product_id" name="store_product_id" defaultValue={broadcast?.store_product_id ?? ""}>
              <option value="">Choose…</option>
              {meta.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        )}
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>{pending ? "Saving…" : broadcast ? "Save draft" : "Create draft"}</Button>
      </FormActions>
    </Form>
  );
}

/** Send now or at a time. Its own form, so a send never saves unsaved edits by surprise. */
export function SendPanel({ broadcast, meta }: { broadcast: MessageBroadcast; meta: MessageBroadcastMeta }) {
  const [state, formAction, pending] = useActionState(sendBroadcastAction, initial);
  const count = broadcast.audience_count ?? 0;

  return (
    <section className="mt-6 border-t border-line pt-4" aria-labelledby="send-heading">
      <h2 id="send-heading" className="mb-2 text-15 font-semibold">Send</h2>
      <p className="measure mb-3 text-12-5 text-muted">
        {count === 1 ? "One contact is" : `${count} contacts are`} in this audience right now. The list is frozen when it is sent.
        Messages go out between {meta.quiet_hours.start} and {meta.quiet_hours.end} only
        {meta.quiet_hours.open_now ? " — the window is open now." : " — the window is closed now, so it waits for the morning."}
      </p>
      <Form action={formAction} state={state} noValidate>
        <input type="hidden" name="id" value={broadcast.id} />
        {state.error && <Alert tone="err" title="Not sent" dismissible={false}>{state.error}</Alert>}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 sm:w-64">
            <Field label="Schedule for (optional)" htmlFor="scheduled_at" variant="float-static" hint="Blank sends now. India time.">
              <Input id="scheduled_at" name="scheduled_at" type="datetime-local" />
            </Field>
          </div>
          <Button type="submit" className="mb-[18px]" pending={pending}
            onClick={(e) => {
              if (!window.confirm(`Send "${broadcast.name}" to ${count} contact${count === 1 ? "" : "s"}? A message sent cannot be recalled.`)) e.preventDefault();
            }}>
            {pending ? "Sending…" : "Send broadcast"}
          </Button>
        </div>
      </Form>
    </section>
  );
}
