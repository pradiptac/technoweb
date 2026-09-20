"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { briefUnansweredAction, type BriefState } from "./actions";

/**
 * "Draft an article" — the assistant writes a knowledge-base draft from
 * the group's questions and the group is marked handled. The draft is a
 * draft: `[CHECK: …]` where the facts go, and nothing publishes it. On
 * success the row becomes a link to it, which is the one thing the editor
 * wants next; on a refusal the API's own sentence is shown beside the
 * button, since "switched off" and "the day's limit" want different
 * responses.
 */
export function BriefButton({ ids }: { ids: number[] }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<BriefState | null>(null);

  if (state?.ok) {
    return (
      <Link href={state.adminPath} className="text-12-5 font-semibold text-brand-ink hover:underline">
        Open the draft: {state.title}
      </Link>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setState(await briefUnansweredAction(ids)))}
        className="rounded-md border border-brand-ink/40 px-2.5 py-1 text-12-5 font-medium text-brand-ink transition-colors hover:bg-brand-50 disabled:opacity-60"
      >
        {pending ? "Drafting…" : "Draft an article"}
      </button>
      {state && !state.ok && <span className="text-12 text-err">{state.error}</span>}
    </span>
  );
}
