"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { toggleSitemapAction, type SitemapState } from "./actions";

const initial: SitemapState = {};

/**
 * A one-field form per row rather than a checkbox that posts on change: this
 * writes to the database, and a mis-click that silently drops a page out of
 * the sitemap is exactly the kind of change that goes unnoticed for weeks.
 */
export function SitemapToggle({
  type, id, included, name,
}: {
  type: string;
  id: number;
  included: boolean;
  name: string;
}) {
  const [state, formAction, pending] = useActionState(toggleSitemapAction, initial);

  return (
    <Form action={formAction} state={state}>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="include" value={included ? "0" : "1"} />
      <button
        type="submit"
        disabled={pending}
        aria-label={included ? `Remove ${name} from the sitemap` : `Add ${name} to the sitemap`}
        className={
          included
            ? "rounded-full border border-ok/25 bg-ok-soft px-2.5 py-1 text-[11.5px] font-semibold text-ok transition-colors hover:border-ok"
            : "rounded-full border border-line-strong bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-muted transition-colors hover:border-faint"
        }
      >
        {pending ? "Saving…" : included ? "Included" : "Excluded"}
      </button>
      {state.error && <p className="mt-1 text-[12px] text-err">{state.error}</p>}
    </Form>
  );
}
