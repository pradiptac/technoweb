"use client";

import Link from "next/link";
import { FormActions } from "@/components/admin/form-actions";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import {
  createFaqAction, updateFaqAction, deleteFaqAction, type FaqFormState,
} from "./actions";
import type { AdminFaq, FaqOwnerGroup } from "@/types/api";

const initial: FaqFormState = {};

export function FaqForm({
  faq, owners, saved,
}: {
  faq?: AdminFaq;
  owners: FaqOwnerGroup[];
  saved?: boolean;
}) {
  const editing = Boolean(faq);
  const [state, formAction, pending] = useActionState(
    editing ? updateFaqAction : createFaqAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  // The API reports the owner as two fields; the form asks one question.
  const ownerErr = err("owner_type") ?? err("owner_id");
  const current = faq?.owner_type && faq?.owner_id ? `${faq.owner_type}:${faq.owner_id}` : "";

  return (
    <form action={formAction} noValidate>
      {editing && <input type="hidden" name="id" value={faq!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          It appears in the FAQ list on {faq!.owner_name ?? "its page"}.
        </Alert>
      )}

      <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Field label="Question" htmlFor="question" error={err("question")}>
            <Input id="question" name="question" defaultValue={faq?.question} required
              aria-invalid={Boolean(err("question"))} />
          </Field>

          <EditorField name="answer" label="Answer" defaultValue={faq?.answer ?? ""} error={err("answer")} />
        </div>

        <aside className="grid content-start gap-0">
          <Field label="Appears on" htmlFor="owner" error={ownerErr}
            hint="Every FAQ belongs to a page. There is nowhere on the site an unattached one would show." variant="float-static">
            <Select
              id="owner" name="owner" defaultValue={current} required
              aria-invalid={Boolean(ownerErr)}
            >
              <option value="">Choose…</option>
              {owners.map((group) => (
                <optgroup key={group.type} label={group.label}>
                  {group.options.map((o) => (
                    <option key={`${group.type}:${o.id}`} value={`${group.type}:${o.id}`}>{o.name}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>

          <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")}
            hint="Lower numbers come first within that page's FAQ list.">
            <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={faq?.sort_order ?? 0} />
          </Field>

          <p className="mb-[18px] rounded border border-line-strong bg-surface p-3 text-[12.5px] leading-[1.5] text-muted">
            The same questions can also be edited inline on the solution, service,
            product or page they belong to. This screen exists to see them all at
            once.
          </p>
        </aside>
      </div>

      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create FAQ"}
        </Button>
        <Link href="/admin/faqs" className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
        {editing && (
          <span className="ml-auto">
            <Button
              type="submit" variant="destructive" size="sm"
              formAction={deleteFaqAction} formNoValidate
              onClick={(e) => {
                if (!window.confirm(`Delete "${faq!.question}"? This cannot be undone.`)) e.preventDefault();
              }}
            >
              Delete FAQ
            </Button>
          </span>
        )}
      </FormActions>
    </form>
  );
}
