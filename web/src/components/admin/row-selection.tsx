"use client";

import { useActionState, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { IconClose } from "@/components/icons-ui";
import type { BulkAction, BulkState } from "@/types/bulk";

/*
 * The selection on a console list (0.139.0): a module-level store read with
 * `useSyncExternalStore`, because a list's table is server-rendered and each
 * row's tick, the header's tick and the bar above are separate client islands
 * with no common client parent to hold it.
 *
 * It is keyed by `scope` — one string per list — so ticks on the blog never
 * appear on the tickets, and the snapshot for a scope is replaced, never
 * mutated, so React can compare it by identity. A scope with nothing ticked
 * returns one shared empty set, for the same reason.
 *
 * The tickets queue and the review queue used to carry a private copy each;
 * they keep their own bars and controls and share this store.
 */
const EMPTY: ReadonlySet<number> = new Set();
const selections = new Map<string, ReadonlySet<number>>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const serverSnapshot = () => EMPTY;

function write(scope: string, next: ReadonlySet<number>) {
  if (next.size === 0) selections.delete(scope);
  else selections.set(scope, next);
  emit();
}

/** The ids ticked on this list. */
export function useSelection(scope: string): ReadonlySet<number> {
  const snapshot = useCallback(() => selections.get(scope) ?? EMPTY, [scope]);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function selectRows(scope: string, ids: Iterable<number>) {
  write(scope, new Set(ids));
}

export function toggleRow(scope: string, id: number) {
  const next = new Set(selections.get(scope) ?? EMPTY);
  if (next.has(id)) next.delete(id); else next.add(id);
  write(scope, next);
}

export function clearSelection(scope: string) {
  if (selections.has(scope)) write(scope, EMPTY);
}

/**
 * One row's tick. The box is the browser's own; the label around it is the
 * 24px target a thumb needs.
 */
export function RowTick({ scope, id, label }: { scope: string; id: number; label: string }) {
  const on = useSelection(scope).has(id);

  return (
    <label className="grid size-6 cursor-pointer place-items-center">
      <input
        type="checkbox"
        checked={on}
        onChange={() => toggleRow(scope, id)}
        aria-label={`Select ${label}`}
        className="size-4 accent-brand-600"
      />
    </label>
  );
}

/** The header's tick: every row on this page, or none. */
export function TickAll({ scope, ids, noun = "row" }: { scope: string; ids: number[]; noun?: string }) {
  const current = useSelection(scope);
  const all = ids.length > 0 && ids.every((id) => current.has(id));
  const some = !all && ids.some((id) => current.has(id));

  return (
    <label className="grid size-6 cursor-pointer place-items-center">
      <input
        type="checkbox"
        checked={all}
        ref={(el) => { if (el) el.indeterminate = some; }}
        onChange={() => (all ? clearSelection(scope) : selectRows(scope, ids))}
        aria-label={all ? "Select none" : `Select every ${noun} on this page`}
        className="size-4 accent-brand-600"
      />
    </label>
  );
}

const LABEL: Record<BulkAction, string> = {
  publish: "Publish",
  draft: "Move to draft",
  archive: "Archive",
  delete: "Delete",
};

const initial: BulkState = {};

/**
 * What appears over a list once anything is ticked: the actions that list
 * offers, each one press, sent as one request to the list's Server Action.
 * The API moves the rows one at a time and says what it did and what it
 * refused — a toast for the count, the refusals in place (`title — message`)
 * until dismissed, so a pass over fifty rows does not stop at the one that
 * cannot move.
 *
 * **Delete asks first**, in a real `<dialog>`, and says how many. The dialog
 * sits inside the form so its confirm button is a submit button of the same
 * form.
 *
 * The selection clears when the page's rows change — a new page, a filter —
 * because a tick on a row that is no longer shown is a tick on something the
 * person cannot see, and after any finished action, because the rows it
 * described have changed. The bar stays while refusals are showing even with
 * nothing ticked.
 */
export function BulkBar({
  scope,
  ids,
  noun,
  actions = ["publish", "draft", "archive", "delete"],
  action,
  hidden,
  deleteNote,
}: {
  scope: string;
  /** Every row's id on this page, in order. */
  ids: number[];
  noun: { one: string; many: string };
  actions?: BulkAction[];
  action: (prev: BulkState, formData: FormData) => Promise<BulkState>;
  /** Extra fields the Server Action needs (a content type's slug). */
  hidden?: Record<string, string>;
  /** One sentence under the delete confirmation, where deleting has a consequence worth saying. */
  deleteNote?: string;
}) {
  const current = useSelection(scope);
  const toast = useToast();
  const [state, formAction, pending] = useActionState(action, initial);
  const [confirming, setConfirming] = useState(false);
  const [dismissed, setDismissed] = useState<BulkState | null>(null);
  const handled = useRef<BulkState>(initial);

  const pageKey = ids.join(",");
  useEffect(() => { clearSelection(scope); }, [scope, pageKey]);

  useEffect(() => {
    if (state === initial || handled.current === state) return;
    handled.current = state;

    if (state.ok) toast({ tone: "ok", title: state.ok });
    else if (state.error) toast({ tone: "err", title: state.error });

    clearSelection(scope);
  }, [state, scope, toast]);

  const closeConfirm = useCallback(() => setConfirming(false), []);

  const count = current.size;
  const refused = dismissed === state ? [] : (state.refused ?? []);

  if (count === 0 && refused.length === 0) return null;

  const named = `${count} ${count === 1 ? noun.one : noun.many}`;

  return (
    <div className="sticky top-13 z-20 mb-3 rounded-lg border border-brand-600 bg-brand-50 px-3 py-2.5" data-bulk-bar>
      <Form action={formAction} state={state} className="flex flex-wrap items-center gap-2">
        {[...current].map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
        {hidden && Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}

        {count > 0 && (
          <>
            <span className="text-13 font-semibold text-brand-ink">{named} selected</span>
            <button type="button" onClick={() => clearSelection(scope)} className="rounded px-2 py-1 text-12-5 font-medium text-brand-ink underline-offset-2 hover:underline">
              Select none
            </button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {actions.filter((a) => a !== "delete").map((a) => (
                <Button key={a} type="submit" name="action" value={a} size="sm" variant={a === "publish" ? "primary" : "secondary"} disabled={pending}>
                  {LABEL[a]}
                </Button>
              ))}
              {actions.includes("delete") && (
                <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => setConfirming(true)}>
                  Delete
                </Button>
              )}
            </div>
          </>
        )}

        {refused.length > 0 && (
          <div className="basis-full text-12-5 text-err" role="alert">
            <div className="flex items-start gap-2">
              <p className="font-semibold">{refused.length === 1 ? "1 was left as it was:" : `${refused.length} were left as they were:`}</p>
              <button
                type="button"
                onClick={() => setDismissed(state)}
                aria-label="Dismiss"
                className="ml-auto grid size-6 shrink-0 place-items-center rounded text-err hover:bg-surface-2"
              >
                <IconClose className="size-3.5" />
              </button>
            </div>
            <ul className="mt-0.5 space-y-0.5">
              {refused.map((r) => <li key={r.id}><span className="font-medium">{r.title}</span> — {r.message}</li>)}
            </ul>
          </div>
        )}

        <Modal
          open={confirming}
          onClose={closeConfirm}
          title={`Delete ${named}?`}
          footer={
            <>
              <Button type="button" variant="ghost" size="sm" onClick={closeConfirm}>Cancel</Button>
              <Button type="submit" name="action" value="delete" size="sm" variant="destructive" pending={pending} onClick={closeConfirm}>
                Delete {named}
              </Button>
            </>
          }
        >
          <p className="text-13 text-ink-2">
            {count === 1 ? "It" : "They"} will be removed for good. Anything that cannot be deleted is left as it is, and
            you will be told which.
          </p>
          {deleteNote && <p className="mt-2 text-13 text-muted">{deleteNote}</p>}
        </Modal>
      </Form>
    </div>
  );
}
