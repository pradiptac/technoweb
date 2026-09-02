"use client";

import { useState, useTransition } from "react";

import { resolveUnansweredAction } from "./actions";

/**
 * Marks one question handled.
 *
 * A button rather than a form, because there is nothing to fill in and a form
 * per row in a table is a row of empty inputs. `useTransition` so the row can
 * say it is working without the whole table blinking.
 */
export function ResolveButton({ ids }: { ids: number[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await resolveUnansweredAction(ids);
            setError(result.error ?? null);
          })
        }
        className="rounded-md border border-line-strong px-2.5 py-1 text-[12.5px] transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Mark handled"}
      </button>
      {error && <span className="text-[12px] text-err">{error}</span>}
    </span>
  );
}
