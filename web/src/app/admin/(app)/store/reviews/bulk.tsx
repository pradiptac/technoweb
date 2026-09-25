"use client";

import { useActionState, useEffect, useSyncExternalStore } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { moderateReviewsAction, type ReviewActionState } from "./actions";

/*
 * The selection, as the ticket queue keeps it: a module-level store read with
 * `useSyncExternalStore`, because the table is server-rendered and each
 * row's tick and the bar above are separate client islands with no common
 * client parent. The snapshot is replaced, never mutated, so React can
 * compare it by identity.
 */
let selected: ReadonlySet<number> = new Set();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => selected;
const EMPTY: ReadonlySet<number> = new Set();
const serverSnapshot = () => EMPTY;

function set(next: Set<number>) { selected = next; emit(); }
function toggle(id: number) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  set(next);
}
function clear() { if (selected.size) set(new Set()); }
function useSelected() { return useSyncExternalStore(subscribe, snapshot, serverSnapshot); }

export function ReviewTick({ id, label }: { id: number; label: string }) {
  const on = useSelected().has(id);
  return (
    <input type="checkbox" checked={on} onChange={() => toggle(id)} aria-label={`Select the review by ${label}`} className="size-4 accent-brand-600" />
  );
}

export function ReviewTickAll({ ids }: { ids: number[] }) {
  const current = useSelected();
  const all = ids.length > 0 && ids.every((id) => current.has(id));
  const some = !all && ids.some((id) => current.has(id));
  return (
    <input
      type="checkbox"
      checked={all}
      ref={(el) => { if (el) el.indeterminate = some; }}
      onChange={() => set(all ? new Set() : new Set(ids))}
      aria-label={all ? "Select none" : "Select every review on this page"}
      className="size-4 accent-brand-600"
    />
  );
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
  const current = useSelected();
  const toast = useToast();
  const [state, action, pending] = useActionState(moderateReviewsAction, initial);

  const pageKey = ids.join(",");
  useEffect(() => { clear(); }, [pageKey]);

  useEffect(() => {
    if (state.ok) {
      toast({ tone: "ok", title: state.ok });
      clear();
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
        <button type="button" onClick={clear} className="rounded px-2 py-1 text-12-5 font-medium text-brand-ink underline-offset-2 hover:underline">
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
