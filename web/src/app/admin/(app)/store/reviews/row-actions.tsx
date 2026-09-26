"use client";

import { useActionState, useEffect, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { deleteReviewAction, featureReviewAction, moderateReviewsAction, type ReviewActionState } from "./actions";
import type { AdminReview } from "@/types/api";

const initial: ReviewActionState = {};

/** An action's outcome as the console reports every outcome: a toast. */
function useOutcome(state: ReviewActionState) {
  const toast = useToast();
  useEffect(() => {
    if (state.ok) toast({ tone: "ok", title: state.ok });
    else if (state.error) toast({ tone: "err", title: state.error });
  }, [state, toast]);
}

const ROW_BUTTON =
  "inline-flex min-h-8 items-center rounded border border-line-strong bg-surface px-2.5 text-12 font-medium whitespace-nowrap transition-colors duration-(--duration-fast) hover:border-faint disabled:opacity-50";

/**
 * One review's own decisions: publish, reject, spam — whichever it is not
 * already — the featured switch once it is published, and delete behind a
 * confirmation. Each is its own small form, so no press can reach the ticks
 * in the selection bar.
 */
export function ReviewRowActions({ review }: { review: AdminReview }) {
  const [state, action, pending] = useActionState(moderateReviewsAction, initial);
  const [featureState, featureAction, featuring] = useActionState(featureReviewAction, initial);
  const [deleteState, deleteAction, deleting] = useActionState(deleteReviewAction, initial);
  const [confirming, setConfirming] = useState(false);

  useOutcome(state);
  useOutcome(featureState);
  useOutcome(deleteState);

  const moves = [
    { value: "published", label: "Publish" },
    { value: "rejected", label: "Reject" },
    { value: "spam", label: "Spam" },
  ].filter((m) => m.value !== review.status);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Form action={action} state={state} className="flex flex-wrap gap-1.5">
        {moves.map((m) => (
          <button key={m.value} type="submit" name="row" value={`${review.id}:${m.value}`} disabled={pending} className={ROW_BUTTON}>
            {m.label}
          </button>
        ))}
      </Form>

      {review.status === "published" && (
        <Form action={featureAction} state={featureState}>
          <input type="hidden" name="id" value={review.id} />
          <input type="hidden" name="featured" value={review.is_featured ? "0" : "1"} />
          <button type="submit" disabled={featuring} aria-pressed={review.is_featured} className={ROW_BUTTON}>
            {review.is_featured ? "Unfeature" : "Feature"}
          </button>
        </Form>
      )}

      <button type="button" onClick={() => setConfirming(true)} className={`${ROW_BUTTON} text-err`}>
        Delete
      </button>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this review for good?"
        description="Rejecting it is the reversible choice. Deleting removes the words from the database."
      >
        <Form action={deleteAction} state={deleteState} className="flex flex-wrap justify-end gap-2" onSubmit={() => setConfirming(false)}>
          <input type="hidden" name="id" value={review.id} />
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Keep it</Button>
          <Button type="submit" variant="destructive" size="sm" pending={deleting}>Delete</Button>
        </Form>
      </Modal>
    </div>
  );
}
