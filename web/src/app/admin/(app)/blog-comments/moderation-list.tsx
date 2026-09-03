"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Alert } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { moderateAction, deleteCommentAction, type ModerateState } from "./actions";
import type { AdminComment } from "@/types/api";

const initial: ModerateState = {};

const stamp = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

/**
 * The moderation queue.
 *
 * **One `<form>` around the whole list**, so the checkbox column and the action
 * buttons are one submission. Moderation is done in batches or it is not done
 * at all — two hundred rows one at a time is a queue nobody empties — and this
 * is what makes the bulk action the primary control rather than a convenience.
 *
 * The per-row buttons submit the same form with a single id, so a single
 * decision and a bulk one travel the same path. Two paths would be two rules
 * about what a status change does, and the drift is silent.
 */
export function ModerationList({ comments }: { comments: AdminComment[] }) {
  const [state, action, pending] = useActionState(moderateAction, initial);
  const [selected, setSelected] = useState<number[]>([]);

  const allSelected = comments.length > 0 && selected.length === comments.length;

  return (
    <>
      {state.error && <Alert tone="err" title="That did not work">{state.error}</Alert>}
      {state.ok && <Alert tone="ok" title="Done">{state.ok}</Alert>}

      <Form action={action} state={state} className="mt-4">
        {/*
          The bar is sticky because the queue is long and the decision is made
          while reading row forty — the same argument `FormActions` makes for
          pinning a form's buttons.
        */}
        <div className="sticky top-0 z-10 -mx-1 mb-3 flex flex-wrap items-center gap-2 border-b border-line bg-page px-1 py-2.5">
          <label className="flex items-center gap-2 text-[13px] font-medium">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => setSelected(e.target.checked ? comments.map((c) => c.id) : [])}
              className="size-4"
            />
            Select all
          </label>

          <span className="text-[12.5px] text-muted">
            {selected.length > 0 ? `${selected.length} selected` : "Nothing selected"}
          </span>

          <div className="ml-auto flex flex-wrap gap-2">
            {/*
              Three buttons rather than a dropdown and a Go: the whole job of
              this screen is two decisions taken quickly, and a select plus a
              submit is two interactions for each of them.
            */}
            {[
              { value: "approved", label: "Publish" },
              { value: "spam", label: "Spam" },
              { value: "trash", label: "Bin" },
            ].map((a) => (
              <button
                key={a.value}
                type="submit"
                name="status"
                value={a.value}
                disabled={pending || selected.length === 0}
                className="rounded border border-line-strong bg-card px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-faint disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <ul className="grid gap-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border border-line bg-card p-3.5">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="ids"
                  value={c.id}
                  checked={selected.includes(c.id)}
                  onChange={(e) =>
                    setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))
                  }
                  className="mt-1 size-4 shrink-0"
                  aria-label={`Select the comment by ${c.author_name}`}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]">
                    <span className="font-semibold">{c.author_name}</span>
                    <span className="font-mono text-[11.5px] text-muted [overflow-wrap:anywhere]">
                      {c.author_email}
                    </span>
                    {c.is_customer && <Badge tone="brand">Customer</Badge>}
                    {c.parent_id && <Badge tone="open">Reply</Badge>}
                    <Badge tone={c.status === "approved" ? "resolved" : c.status === "spam" ? "urgent" : "progress"}>
                      {c.status_label}
                    </Badge>
                    <span className="text-faint">{stamp(c.created_at)}</span>
                  </div>

                  {/*
                    Plain text by construction — the column stores no markup at
                    all — so rendering it as a string is both correct and the
                    whole reason this feature has no stored-XSS surface.
                    `[overflow-wrap:anywhere]` because a spam comment is often
                    one unbroken run with no spaces for `break-words` to use.
                  */}
                  <p className="mt-2 max-w-[80ch] text-[13.5px] leading-[1.6] whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {c.body}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                    {c.post && (
                      <span>
                        on <span className="font-medium">{c.post.title}</span>
                      </span>
                    )}
                    <ScoreHint comment={c} />
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-1.5">
                  <RowButton id={c.id} status="approved" label="Publish" pending={pending} />
                  <RowButton id={c.id} status="spam" label="Spam" pending={pending} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Form>

      {/*
        Deletion is its own form, outside the bulk one: a nested <form> is
        invalid markup and the browser drops the inner one, so a delete button
        inside the list's form would submit the bulk action instead.
      */}
      <DeleteRow comments={comments} />
    </>
  );
}

function RowButton({ id, status, label, pending }: { id: number; status: string; label: string; pending: boolean }) {
  return (
    <button
      type="submit"
      name="status"
      value={status}
      disabled={pending}
      // Submits this row alone by carrying its own id, so a single decision and
      // a bulk one are the same request shape.
      onClick={(e) => {
        const form = e.currentTarget.form;
        if (!form) return;
        const hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.name = "ids";
        hidden.value = String(id);
        form.appendChild(hidden);
      }}
      className="rounded border border-line-strong bg-surface px-2.5 py-1 text-[12px] font-medium whitespace-nowrap transition-colors hover:border-faint disabled:opacity-50"
    >
      {label}
    </button>
  );
}

/**
 * Why the score is what it is.
 *
 * A number without its working is one nobody argues with and therefore one
 * nobody trusts — the rule `SeoScore` and `LeadScore` both follow. Shown as a
 * title rather than always expanded, because on a queue of two hundred the
 * reasons are what you look at for the one row you are unsure about.
 */
function ScoreHint({ comment }: { comment: AdminComment }) {
  const failed = (comment.score_reasons ?? []).filter((r) => r.applies && !r.passed);

  return (
    <span
      className="tabular-nums"
      title={failed.length ? failed.map((r) => r.hint).filter(Boolean).join("\n") : "Nothing counted against it."}
    >
      score {comment.score}/100
      {failed.length > 0 && ` · ${failed.length} against`}
    </span>
  );
}

function DeleteRow({ comments }: { comments: AdminComment[] }) {
  const [state, action, pending] = useActionState(deleteCommentAction, initial);
  const [id, setId] = useState("");

  if (comments.length === 0) return null;

  return (
    <Form action={action} state={state} className="mt-6 border-t border-line pt-4">
      <p className="text-[12.5px] text-muted">
        Deleting removes a comment for good. Marking it spam is the reversible choice, and is
        what almost everything here wants.
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-[12.5px]">
          <span className="mb-1 block font-medium">Comment id</span>
          <input
            name="id"
            value={id}
            onChange={(e) => setId(e.target.value)}
            inputMode="numeric"
            className="w-28 rounded border border-line-strong bg-card px-2.5 py-1.5 text-[13px]"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !id}
          className="rounded border border-err-fill bg-err-fill px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors disabled:opacity-50"
        >
          Delete for good
        </button>
      </div>

      {state.error && <p className="mt-1.5 text-[12px] text-err">{state.error}</p>}
      {state.ok && <p className="mt-1.5 text-[12px] text-ok">{state.ok}</p>}
    </Form>
  );
}
