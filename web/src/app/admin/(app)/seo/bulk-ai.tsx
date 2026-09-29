"use client";

import { useActionState } from "react";
import { Alert, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import type { SeoAiMeta, SeoRow } from "@/types/api";
import { bulkAiAction, type BulkAiState } from "./actions";
import { BULK_AI_PER_TYPE } from "./bulk-ai-limit";

/**
 * "Draft with AI for these N" — the assistant run from the overview.
 *
 * The overview already answers "which records fail this check"; this is the
 * button that does something about all of them. It posts the rows on the
 * screen (as `type:id`, up to the API's 25 per type) and one action, and
 * the API queues a suggestion per record. Nothing is written to a record:
 * each suggestion lands as `pending` on its SEO panel for the editor to
 * accept or reject, and `?ai=pending` here is the queue of what is waiting.
 *
 * Rendered only when the assistant is on and has a key — the API sends its
 * state with the overview — and never when the screen is unfiltered: fifty
 * records drafted at once is a bill, and the point of the overview's
 * filters is to name the ones worth it. `generate` is offered first because
 * "no title" and "no description" are the two checks that dominate a fresh
 * install and it answers both.
 */
export function BulkAi({ rows, ai, filtered }: { rows: SeoRow[]; ai: SeoAiMeta; filtered: boolean }) {
  const [state, formAction, pending] = useActionState<BulkAiState | null, FormData>(bulkAiAction, null);

  if (!ai.enabled || !ai.configured || !filtered || rows.length === 0) return null;

  // What will actually be queued: the API takes at most BULK_AI_PER_TYPE ids
  // per record type, and the action sends no more. Counting every row on the
  // screen promised a run of fifty that queued twenty-five.
  const perType = new Map<string, number>();
  const sent = rows.filter((r) => {
    const n = perType.get(r.type) ?? 0;
    perType.set(r.type, n + 1);
    return n < BULK_AI_PER_TYPE;
  });
  const waiting = sent.filter((r) => r.ai_pending > 0).length;

  return (
    <div className="mb-4 rounded-lg border border-line-strong bg-card p-3">
      <Form action={formAction} state={state && !state.ok ? state : undefined} className="flex flex-wrap items-end gap-3">
        {sent.map((r) => <input key={`${r.type}:${r.id}`} type="hidden" name="ids" value={`${r.type}:${r.id}`} />)}
        <div>
          <label htmlFor="bulk-ai-action" className="mb-0.5 block text-11 font-semibold text-faint">Draft with the assistant</label>
          <Select id="bulk-ai-action" name="action" defaultValue="generate">
            {ai.actions.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </Select>
        </div>
        <Button type="submit" size="sm" pending={pending} disabled={ai.today.reached}>
          {`Draft for these ${sent.length}`}
        </Button>
        <p className="text-12-5 text-muted">
          {ai.today.remaining === null ? `${ai.today.runs} used today.` : `${ai.today.remaining} of ${ai.today.cap} left today.`}
          {waiting > 0 && ` ${waiting} of these already ${waiting === 1 ? "has" : "have"} a suggestion waiting.`}
          {" "}Suggestions land on each record&apos;s SEO panel; nothing is published.
        </p>
      </Form>
      {ai.usage.length > 0 && (
        /*
          Which model to keep paying for: what each produced in the last
          ninety days and how much of it an editor accepted. The rate is
          null while nothing has been decided, and says so, rather than
          reading forty pending suggestions as 0%.
        */
        <p className="mt-2 text-12 text-faint">
          {ai.usage.map((u) => (
            `${u.model}: ${u.suggestions} suggested, ${u.applied} applied, ${u.rejected} rejected` +
            (u.acceptance === null ? " (nothing decided yet)" : ` — ${Math.round(u.acceptance * 100)}% accepted`) +
            ` · ${u.tokens.toLocaleString("en-IN")} tokens`
          )).join(" · ")}
        </p>
      )}
      {state && (
        <div className="mt-3">
        <Alert
          tone={state.ok ? "ok" : "err"}
          title={state.ok ? `${state.queued} queued` : "Nothing was queued"}
        >
          {state.ok
            ? <>
                {state.skippedPending > 0 && `${state.skippedPending} skipped — a suggestion is already waiting. `}
                {state.skippedCap > 0 && `${state.skippedCap} skipped — today's limit. `}
                {state.delivering
                  ? "They will appear as the queue runs, usually within a minute."
                  : "Nothing is draining the queue on this server — start the scheduler or a worker, or they will wait."}
              </>
            : state.error}
        </Alert>
        </div>
      )}
    </div>
  );
}
