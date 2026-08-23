"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import {
  createRedirectAction, updateRedirectAction, deleteRedirectAction, type RedirectFormState,
} from "./actions";
import type { AdminRedirect } from "@/types/api";

const initial: RedirectFormState = {};

export function RedirectForm({ record, saved }: { record?: AdminRedirect; saved?: boolean }) {
  const editing = Boolean(record);
  const [state, formAction, pending] = useActionState(
    editing ? updateRedirectAction : createRedirectAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <form action={formAction} noValidate>
      {editing && <input type="hidden" name="id" value={record!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && <Alert tone="ok" title="Saved">The redirect is live immediately.</Alert>}

      {editing && record!.created_automatically && (
        <Alert tone="warn" title="Written automatically">
          The CMS created this when a slug changed. Deleting it will 404 the old
          URL and lose whatever ranking it had.
        </Alert>
      )}

      <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Field label="Redirect from" htmlFor="from_path" error={err("from_path")}
            hint="A path on this site, starting with a slash. Saved without a trailing slash.">
            <Input id="from_path" name="from_path" defaultValue={record?.from_path}
              placeholder="/old-page" required className="font-mono text-[14px]"
              aria-invalid={Boolean(err("from_path"))} />
          </Field>

          <Field label="Redirect to" htmlFor="to_path" error={err("to_path")}
            hint="A path on this site, or a full URL if it now lives elsewhere.">
            <Input id="to_path" name="to_path" defaultValue={record?.to_path}
              placeholder="/new-page" required className="font-mono text-[14px]"
              aria-invalid={Boolean(err("to_path"))} />
          </Field>
        </div>

        <aside className="grid content-start gap-0">
          <Field label="Type" htmlFor="status_code" error={err("status_code")}
            hint="Permanent passes ranking to the new URL. Use temporary only if the move will be reversed." variant="float-static">
            <Select
              id="status_code" name="status_code" defaultValue={String(record?.status_code ?? 301)}
            >
              <option value="301">301 — permanent</option>
              <option value="308">308 — permanent, same method</option>
              <option value="302">302 — temporary</option>
              <option value="307">307 — temporary, same method</option>
            </Select>
          </Field>

          <Field label="Active" htmlFor="is_active"
            hint="Turn off to stop the redirect without losing the row." variant="float-static">
            <Select
              id="is_active" name="is_active" defaultValue={record?.is_active === false ? "0" : "1"}
            >
              <option value="1">Yes</option>
              <option value="0">No</option>
            </Select>
          </Field>

          {editing && (
            <p className="mb-[18px] rounded border border-line-strong bg-surface p-3 text-[12.5px] leading-[1.5] text-muted">
              Followed <strong>{record!.hit_count}</strong>{" "}
              {record!.hit_count === 1 ? "time" : "times"}
              {record!.last_hit_at
                ? `, last on ${new Date(record!.last_hit_at).toLocaleDateString("en-GB")}.`
                : ". Never yet — check the path is right."}
            </p>
          )}
        </aside>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create redirect"}
        </Button>
        <Link href="/admin/redirects" className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
        {editing && (
          <span className="ml-auto">
            <Button
              type="submit" variant="destructive" size="sm"
              formAction={deleteRedirectAction} formNoValidate
              onClick={(e) => {
                const warning = record!.created_automatically
                  ? `Delete the redirect from ${record!.from_path}? The CMS created it when a slug changed, so that URL will start 404ing.`
                  : `Delete the redirect from ${record!.from_path}? This cannot be undone.`;
                if (!window.confirm(warning)) e.preventDefault();
              }}
            >
              Delete redirect
            </Button>
          </span>
        )}
      </div>
    </form>
  );
}
