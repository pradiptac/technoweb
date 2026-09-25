"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Form } from "@/components/ui/form";
import { FormActions } from "@/components/admin/form-actions";
import { CoverField } from "@/components/admin/cover-field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { approvalTone } from "../tones";
import {
  saveMessageTemplateAction, submitMessageTemplateAction, testMessageTemplateAction, type MessagingFormState,
} from "../actions";
import type { MessageButton, MessageChannelValue, MessageTemplate, MessageTemplateMeta } from "@/types/api";

const initial: MessagingFormState = {};

/** Fill `{{name}}` with the sample values the API sent, the way the server fills them. */
function fill(text: string, samples: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, name: string) => samples[name.toLowerCase()] ?? "");
}

/**
 * One template: the words, the channel's trimmings, and a phone beside them
 * showing what arrives.
 *
 * The preview fills placeholders with the API's own sample values, so it is
 * the message a customer sees, not the template. Chips insert a placeholder
 * at the cursor — every event's list is offered, with the chosen event's
 * first, because a template is written for an event but not bound to one.
 */
export function TemplateEditor({ template, meta }: { template?: MessageTemplate; meta: MessageTemplateMeta }) {
  const editing = Boolean(template);
  const [state, formAction, pending] = useActionState(saveMessageTemplateAction, initial);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  const [channel, setChannel] = useState<MessageChannelValue>(template?.channel ?? "whatsapp");
  const [body, setBody] = useState(template?.body ?? "");
  const [header, setHeader] = useState(template?.header_text ?? "");
  const [title, setTitle] = useState(template?.push_title ?? "");
  const [buttons, setButtons] = useState<MessageButton[]>(template?.buttons ?? []);
  const [hasPicture, setHasPicture] = useState(Boolean(template?.media_path));
  const [event, setEvent] = useState(meta.events[0]?.value ?? "");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const channelMeta = meta.channels.find((c) => c.value === channel);
  const chosenEvent = meta.events.find((e) => e.value === event);
  const chips = [...meta.common_placeholders, ...(chosenEvent?.placeholders ?? [])];

  const insert = (name: string) => {
    const el = bodyRef.current;
    const token = `{{${name}}}`;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const setButton = (i: number, patch: Partial<MessageButton>) =>
    setButtons((all) => all.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  return (
    <div className="grid gap-x-8 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <Form action={formAction} state={state} noValidate>
          {template && <input type="hidden" name="id" value={template.id} />}
          <input type="hidden" name="buttons" value={JSON.stringify(buttons)} />
          {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

          {template && (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-12-5 text-muted">
              <Badge tone={approvalTone(template.approval_status)}>{template.approval_label}</Badge>
              {template.approval_reason && <span>{template.approval_reason}</span>}
            </div>
          )}

          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Channel" htmlFor="channel" error={err("channel")} variant="float-static"
              hint={editing ? "Fixed once saved." : channelMeta?.needs_approval ? "WhatsApp reviews every template before it can be sent." : "No approval step on this channel."}>
              <Select id="channel" name="channel" value={channel} disabled={editing}
                onChange={(e) => setChannel(e.target.value as MessageChannelValue)}>
                {meta.channels.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Name" htmlFor="name" error={err("name")} hint="For the console.">
              <Input id="name" name="name" defaultValue={template?.name} required />
            </Field>
            <Field label="Key" htmlFor="key" error={err("key")}
              hint="Lower case, digits and underscores. For WhatsApp it is also the template's name at Meta unless you set one below.">
              <Input id="key" name="key" defaultValue={template?.key} required pattern="[a-z][a-z0-9_]+" className="font-mono" />
            </Field>
            {channel === "whatsapp" && (
              <Field label="Category" htmlFor="category" error={err("category")} variant="float-static"
                hint="Utility for order and ticket updates; marketing for reminders and broadcasts. WhatsApp re-categorises a template it disagrees with.">
                <Select id="category" name="category" defaultValue={template?.category ?? "utility"}>
                  {meta.categories.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
                </Select>
              </Field>
            )}
          </div>

          {channel === "whatsapp" && (
            <Field label="Header" htmlFor="header_text" error={err("header_text")} hint="Optional, bold above the message. 60 characters.">
              <Input id="header_text" name="header_text" maxLength={60} value={header} onChange={(e) => setHeader(e.target.value)} />
            </Field>
          )}

          {channel === "push" && (
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Notification title" htmlFor="push_title" error={err("push_title")} hint="Placeholders work here too. Blank uses the company name.">
                <Input id="push_title" name="push_title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Opens" htmlFor="push_link" error={err("push_link")} hint="A path on this site, such as {{order_url}} or /store, or an https:// address.">
                <Input id="push_link" name="push_link" defaultValue={template?.push_link ?? ""} placeholder="/store" />
              </Field>
            </div>
          )}

          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label htmlFor="chip-event" className="text-12-5 font-semibold text-muted">Placeholders for</label>
            <Select id="chip-event" value={event} onChange={(e) => setEvent(e.target.value)} className="w-auto">
              {meta.events.map((e) => <option key={e.value} value={e.value}>{e.label}{e.promotional ? " (promotional)" : ""}</option>)}
            </Select>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Insert a placeholder">
            {chips.map((name) => (
              <button key={name} type="button" onClick={() => insert(name)}
                className="min-h-6 rounded-full border border-line-strong bg-surface-2 px-2.5 py-0.5 font-mono text-12 text-ink-2 hover:border-brand-ink/40 hover:text-brand-ink">
                {`{{${name}}}`}
              </button>
            ))}
          </div>

          <Field label="Message" htmlFor="body" error={err("body")}
            hint="Plain text. A placeholder no event offers is removed when the message is sent. WhatsApp counts 1,024 characters.">
            <Textarea id="body" name="body" ref={bodyRef} rows={6} maxLength={1024} required value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>

          <CoverField
            name="media_path" label={channel === "push" ? "Notification image" : "Picture"}
            defaultPath={template?.media_path ?? null} defaultUrl={template?.media_url ?? null}
            hint={channel === "whatsapp" ? "A header image. It must match what WhatsApp approved — a template approved with text only will not take one." : "JPG or PNG. Shown above the message."}
            onPathChange={(p) => setHasPicture(Boolean(p))}
          />

          {channel !== "push" && (
            <fieldset className="mb-[18px]">
              <legend className="mb-2 block text-13-5 font-semibold">{channel === "whatsapp" ? "Buttons" : "Suggestions"}</legend>
              {err("buttons") && <p className="mb-2 text-12-5 text-err">{err("buttons")}</p>}
              <ul className="grid gap-3">
                {buttons.map((b, i) => (
                  <li key={i} className="grid gap-x-3 rounded border border-line-strong bg-card p-3 sm:grid-cols-[140px_1fr_1fr_auto]">
                    <Field label="Kind" htmlFor={`btn-type-${i}`} variant="float-static" className="mb-0">
                      <Select id={`btn-type-${i}`} value={b.type} onChange={(e) => setButton(i, { type: e.target.value as MessageButton["type"] })}>
                        <option value="reply">Quick reply</option>
                        <option value="url">Open a link</option>
                        <option value="phone">Call a number</option>
                      </Select>
                    </Field>
                    <Field label="Text" htmlFor={`btn-text-${i}`} error={err(`buttons.${i}.text`)} className="mb-0">
                      <Input id={`btn-text-${i}`} maxLength={25} value={b.text} onChange={(e) => setButton(i, { text: e.target.value })} />
                    </Field>
                    <Field label={b.type === "url" ? "https:// address" : b.type === "phone" ? "Number" : "Reply value (optional)"} htmlFor={`btn-value-${i}`} error={err(`buttons.${i}.value`)} className="mb-0">
                      <Input id={`btn-value-${i}`} value={b.value} onChange={(e) => setButton(i, { value: e.target.value })} />
                    </Field>
                    <Button type="button" variant="ghost" size="sm" className="self-center"
                      onClick={() => setButtons((all) => all.filter((_, j) => j !== i))} aria-label={`Remove button ${i + 1}`}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
              {buttons.length < 3 && (
                <Button type="button" variant="secondary" size="sm" className="mt-3"
                  onClick={() => setButtons((all) => [...all, { type: "reply", text: "", value: "" }])}>
                  Add a {channel === "whatsapp" ? "button" : "suggestion"}
                </Button>
              )}
            </fieldset>
          )}

          <details className="mb-[18px] rounded border border-line-strong bg-card p-3">
            <summary className="cursor-pointer text-13-5 font-semibold">At the provider</summary>
            <div className="mt-3 grid gap-x-4 sm:grid-cols-3">
              <Field label="Language" htmlFor="language" error={err("language")} hint="en, hi, en_US…">
                <Input id="language" name="language" defaultValue={template?.language ?? "en"} className="font-mono" />
              </Field>
              <Field label={channel === "rcs" ? "Template code" : "Name at the provider"} htmlFor="provider_template_name" error={err("provider_template_name")}
                hint={channel === "rcs" ? "Gupshup RCS: the approved template's code. Blank sends plain text." : "Blank uses the key."}>
                <Input id="provider_template_name" name="provider_template_name" defaultValue={template?.provider_template_name ?? ""} className="font-mono" />
              </Field>
              <Field label="Provider's id" htmlFor="provider_template_id" error={err("provider_template_id")}
                hint="Filled by a sync. Gupshup sends by it; Twilio's is the Content SID (HX…).">
                <Input id="provider_template_id" name="provider_template_id" defaultValue={template?.provider_template_id ?? ""} className="font-mono" />
              </Field>
            </div>
          </details>

          <FormActions>
            <Button type="submit" pending={pending}>{pending ? "Saving…" : editing ? "Save template" : "Create template"}</Button>
          </FormActions>
        </Form>

        {template && <TemplateTools template={template} />}
      </div>

      <aside className="xl:sticky xl:top-20 xl:self-start" aria-label="Preview">
        <PhonePreview
          channel={channel}
          header={channel === "whatsapp" ? fill(header, meta.samples) : channel === "push" ? fill(title, meta.samples) : ""}
          body={fill(body, meta.samples)}
          picture={hasPicture}
          buttons={channel === "push" ? [] : buttons}
        />
        <p className="mt-2 text-12 text-faint">Filled with sample values. What arrives depends on the phone and the app.</p>
      </aside>
    </div>
  );
}

/** Submit for approval and send a test — presses on a saved template, outside the form. */
function TemplateTools({ template }: { template: MessageTemplate }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<MessagingFormState>({});
  const [to, setTo] = useState("");
  const approval = template.channel === "whatsapp";

  return (
    <section className="mt-6 border-t border-line pt-4" aria-labelledby="template-tools">
      <h2 id="template-tools" className="mb-3 text-15 font-semibold">Approval and testing</h2>
      {result.error && <Alert tone="err" title="That did not work">{result.error}</Alert>}
      {result.ok && <Alert tone="ok" title="Sent">{result.ok}</Alert>}

      {approval && (
        <div className="mb-4">
          <p className="measure mb-2 text-12-5 text-muted">
            Submitting sends the saved wording to WhatsApp for review. Edit and save first — a change
            after approval puts it back to &ldquo;not submitted&rdquo;.
          </p>
          <Button type="button" size="sm" variant="secondary" pending={busy}
            disabled={template.approval_status === "pending" || template.approval_status === "approved"}
            onClick={() => start(async () => setResult(await submitMessageTemplateAction(template.id)))}>
            Submit for approval
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 sm:max-w-[22rem]">
          <Field label={template.channel === "push" ? "Send a test to (registration token)" : "Send a test to (mobile)"} htmlFor="template_test_to">
            <Input id="template_test_to" autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)}
              inputMode={template.channel === "push" ? undefined : "tel"} />
          </Field>
        </div>
        <Button type="button" size="sm" className="mb-[18px]" disabled={busy || !to.trim()}
          onClick={() => start(async () => setResult(await testMessageTemplateAction(template.id, to)))}>
          {busy ? "Sending…" : "Send test"}
        </Button>
      </div>
      <p className="measure text-12-5 text-muted">
        The saved template, filled with sample values.{approval ? " WhatsApp refuses a template it has not approved." : ""}
      </p>
    </section>
  );
}

/**
 * A phone, drawn in tokens: a chat bubble for WhatsApp and RCS, a
 * notification card for push. Decorative framing, real text.
 */
function PhonePreview({
  channel, header, body, picture, buttons,
}: {
  channel: MessageChannelValue;
  header: string;
  body: string;
  picture: boolean;
  buttons: MessageButton[];
}) {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[2rem] border-4 border-line-strong bg-surface-2 p-3 shadow-3">
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-line-strong" aria-hidden />
      {channel === "push" ? (
        <div className="rounded-xl border border-line-strong bg-card p-3">
          <p className="text-12 font-semibold text-muted">Notification</p>
          {header && <p className="mt-1 text-13-5 font-semibold text-ink">{header}</p>}
          <p className="mt-0.5 whitespace-pre-line text-13 text-ink-2">{body || "Your message appears here."}</p>
          {picture && <div className="mt-2 flex h-24 items-center justify-center rounded bg-surface-2 text-12 text-muted">Picture</div>}
        </div>
      ) : (
        <div className="min-h-64 rounded-xl bg-page p-3">
          <div className="max-w-[92%] rounded-lg rounded-tl-none border border-line bg-card p-2.5 shadow-1">
            {picture && <div className="mb-2 flex h-28 items-center justify-center rounded bg-surface-2 text-12 text-muted">Picture</div>}
            {header && <p className="mb-1 text-13-5 font-semibold text-ink">{header}</p>}
            <p className="whitespace-pre-line text-13 [overflow-wrap:anywhere] text-ink">{body || "Your message appears here."}</p>
            <p className="mt-1 text-right text-12 text-faint">12:04</p>
          </div>
          {buttons.filter((b) => b.text.trim()).map((b, i) => (
            <div key={i} className="mt-1.5 max-w-[92%] rounded-lg border border-line bg-card px-2.5 py-1.5 text-center text-13 font-semibold text-brand-ink">
              {b.text}
            </div>
          ))}
          <p className="mt-3 text-center text-12 text-faint">{channel === "whatsapp" ? "WhatsApp" : "RCS"}</p>
        </div>
      )}
    </div>
  );
}
