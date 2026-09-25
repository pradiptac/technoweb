"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { FormActions } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Alert, Select } from "@/components/ui/input";
import { saveAutomationsAction, type MessagingFormState } from "../actions";
import type { MessageAutomationCell, MessageAutomationMeta } from "@/types/api";

const initial: MessagingFormState = {};

/**
 * The eight events down the side, the three channels across: a template and
 * a switch per cell, saved together. A switched-on cell that would send
 * nothing says why under it — the template waiting for WhatsApp, the
 * channel not configured — because a switch that is on and silent is the
 * failure this screen exists to make visible.
 */
export function AutomationsForm({ cells, meta }: { cells: MessageAutomationCell[]; meta: MessageAutomationMeta }) {
  const [state, formAction, pending] = useActionState(saveAutomationsAction, initial);
  const events = cells.filter((c, i) => cells.findIndex((d) => d.event === c.event) === i);
  const cell = (event: string, channel: string) => cells.find((c) => c.event === event && c.channel === channel);

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {state.ok && <Alert tone="ok" title="Saved">{state.ok}</Alert>}

      <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
        <table className="admin-table w-full min-w-[860px] text-left text-13">
          <thead>
            <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
              <th scope="col" className="px-3 py-1.5">Event</th>
              {meta.channels.map((c) => (
                <th key={c.value} scope="col" className="px-3 py-1.5">
                  {c.label}{c.ready ? "" : " — off"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.event} className="border-b border-line align-top last:border-b-0">
                <th scope="row" data-label="Event" className="px-3 py-2 text-left font-normal">
                  <span className="text-13-5 font-medium text-ink">{e.event_label}</span>
                  <span className="mt-0.5 block text-12 text-faint">{e.promotional ? "Promotional — quiet hours" : "Transactional — any hour"}</span>
                </th>
                {meta.channels.map((ch) => {
                  const c = cell(e.event, ch.value);
                  const key = `${e.event}|${ch.value}`;
                  const templates = meta.templates.filter((t) => t.channel === ch.value);

                  return (
                    <td key={ch.value} data-label={ch.label} className="px-3 py-2">
                      <input type="hidden" name="cell" value={key} />
                      <label htmlFor={`template__${key}`} className="sr-only">{`${e.event_label} on ${ch.label}`}</label>
                      <Select id={`template__${key}`} name={`template__${key}`} defaultValue={c?.message_template_id ?? ""}>
                        <option value="">No template</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}{t.sendable ? "" : ` (${t.approval_label.toLowerCase()})`}</option>
                        ))}
                      </Select>
                      <label className="mt-1.5 flex min-h-6 cursor-pointer items-center gap-2 text-12-5 text-ink-2">
                        <input type="checkbox" name={`enabled__${key}`} value="1" defaultChecked={c?.is_enabled}
                          className="size-4 accent-[var(--color-brand-600)]" />
                        Send
                      </label>
                      {c?.is_enabled && c.reason && <p className="mt-1 text-12 text-warn">{c.reason}</p>}
                      {c?.live && <p className="mt-1 text-12 text-ok">Live</p>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>{pending ? "Saving…" : "Save automations"}</Button>
      </FormActions>
    </Form>
  );
}
