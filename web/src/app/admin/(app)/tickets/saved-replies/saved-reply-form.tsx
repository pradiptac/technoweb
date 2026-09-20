"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { Form } from "@/components/ui/form";
import { FormActions } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { createSavedReplyAction, updateSavedReplyAction, type SavedReplyState } from "./actions";
import type { CannedReply, CannedReplyPlaceholder } from "@/types/api";

const initial: SavedReplyState = {};

/**
 * The placeholder chips come from the API's `meta.placeholders`, never from
 * a list typed here — the fill and the chips are one list on one side of
 * the wire. Pressing a chip writes `{{name}}` at the cursor.
 */
export function SavedReplyForm({ record, placeholders }: { record?: CannedReply; placeholders: CannedReplyPlaceholder[] }) {
  const action = record ? updateSavedReplyAction.bind(null, record.id) : createSavedReplyAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  function insertPlaceholder(name: string) {
    const box = bodyRef.current;
    if (!box) return;
    const token = `{{${name}}}`;
    const start = box.selectionStart;
    const end = box.selectionEnd;
    const next = `${box.value.slice(0, start)}${token}${box.value.slice(end)}`;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) setter.call(box, next);
    else box.value = next;
    box.dispatchEvent(new Event("input", { bubbles: true }));
    box.focus();
    box.setSelectionRange(start + token.length, start + token.length);
  }

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Field label="Title" htmlFor="title" error={err("title")}
            hint="What the picker on a ticket lists. Short and specific — “Firmware rollback”, not “Reply 3”.">
            <Input id="title" name="title" defaultValue={record?.title} required maxLength={160}
              aria-invalid={Boolean(err("title"))} />
          </Field>

          <Field label="Reply" htmlFor="body" error={err("body")}
            hint={
              <>
                Plain text, pasted into the reply box as it is. Each placeholder is filled in for the ticket it is used on:{" "}
                {placeholders.map((p, i) => (
                  <span key={p.name}>
                    {i > 0 && " · "}
                    <button
                      type="button"
                      onClick={() => insertPlaceholder(p.name)}
                      title={p.about}
                      className="inline-flex min-h-6 items-center rounded border border-line-strong bg-surface px-1.5 font-mono text-11-5 text-ink hover:border-brand-300 hover:bg-brand-50"
                    >
                      {`{{${p.name}}}`}
                    </button>
                  </span>
                ))}
              </>
            }>
            <Textarea ref={bodyRef} id="body" name="body" rows={10} defaultValue={record?.body} required
              aria-invalid={Boolean(err("body"))} />
          </Field>
        </div>

        <aside className="grid content-start gap-0">
          <Field label="Order" htmlFor="sort_order" error={err("sort_order")} hint="Lower numbers first in the picker; ties by title.">
            <Input id="sort_order" name="sort_order" type="number" min={0} max={65535} defaultValue={record?.sort_order ?? 0} />
          </Field>

          <dl className="mb-[18px] rounded border border-line-strong bg-surface p-3 text-12-5 leading-[1.5] text-muted">
            {placeholders.map((p) => (
              <div key={p.name} className="mb-1.5 last:mb-0">
                <dt className="font-mono text-11-5 text-ink">{`{{${p.name}}}`}</dt>
                <dd>{p.about}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : record ? "Save reply" : "Create reply"}
        </Button>
        <Link href="/admin/tickets/saved-replies" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
      </FormActions>
    </Form>
  );
}
