"use client";

import { useActionState, useEffect } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { RowTick, TickAll, clearSelection, useSelection } from "@/components/admin/row-selection";
import { moderateReviewsAction, type ReviewActionState } from "./actions";

/*
 * The selection is the console's shared store (`components/admin/row-selection`),
 * keyed by this list's scope.
 */
const SCOPE = "reviews";

export function ReviewTick({ id, label }: { id: number; label: string }) {
  return <RowTick scope={SCOPE} id={id} label={`the review by ${label}`} />;
}

export function ReviewTickAll({ ids }: { ids: number[] }) {
  return <TickAll scope={SCOPE} ids={ids} noun="review" />;
}

const initial: ReviewActionState = {};

const ACTIONS = [
  { value: "published", label: "Publish" },
  { value: "rejected", label: "Reject" },
  { value: "spam", label: "Spam" },
  { value: "pending", label: "Back to waiting" },
] as const;

/**
 * What appears above the queue once anything is ticked: four decisions,
 * each one press, sent as one request — the API moves the rows one at a time
 * so every stamp and the product's rating follow. The outcome is a toast and
 * the selection clears, because the rows it described have changed. It also
 * clears when the page's rows change, so a tick never outlives the row it
 * was on.
 */
export function ReviewBulkBar({ ids }: { ids: number[] }) {
  const current = useSelection(SCOPE);
  const toast = useToast();
  const [state, action, pending] = useActionState(moderateReviewsAction, initial);

  const pageKey = ids.join(",");
  useEffect(() => { clearSelection(SCOPE); }, [pageKey]);

  useEffect(() => {
    if (state.ok) {
      toast({ tone: "ok", title: state.ok });
      clearSelection(SCOPE);
    } else if (state.error) {
      toast({ tone: "err", title: state.error });
    }
  }, [state, toast]);

  const count = current.size;
  if (count === 0) return null;

  return (
    <div className="sticky top-13 z-20 mb-3 rounded-lg border border-brand-600 bg-brand-50 px-3 py-2.5" data-bulk-bar>
      <Form action={action} state={state} className="flex flex-wrap items-center gap-2">
        {[...current].map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
        <span className="text-13 font-semibold text-brand-ink">{count} review{count === 1 ? "" : "s"} selected</span>
        <button type="button" onClick={() => clearSelection(SCOPE)} className="rounded px-2 py-1 text-12-5 font-medium text-brand-ink underline-offset-2 hover:underline">
          Select none
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {ACTIONS.map((a) => (
            <Button key={a.value} type="submit" name="status" value={a.value} size="sm" variant={a.value === "published" ? "primary" : "secondary"} disabled={pending}>
              {a.label}
            </Button>
          ))}
        </div>
      </Form>
    </div>
  );
}
