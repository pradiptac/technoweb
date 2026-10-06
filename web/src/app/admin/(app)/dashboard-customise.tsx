"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { IconSliders } from "@/components/icons-ui";
import { DEFAULT_VIEW, GROUPS, WIDGETS, isDefaultView, type DashboardView, type GroupKey, type WidgetKey } from "@/lib/dashboard-view";
import { saveDashboardView } from "./dashboard-actions";

/**
 * "Customise" on the dashboard: which panels it shows this account, and in
 * what order (0.120.0).
 *
 * Only what this role's dashboard can actually draw is listed — `available`
 * and `groups` come from the same data the page arranges — so the dialog
 * never offers a "Sales pipeline" switch to somebody the API sends no
 * pipeline. A panel this role cannot see keeps whatever place it had and goes
 * to the end of the stored order, where it disturbs nothing.
 *
 * The draft lives in the dialog and is copied from the saved view when it
 * opens, in the click handler rather than an effect. Save is the Server
 * Action; the page re-renders from the cookie it wrote, so there is no second
 * copy of the arrangement in the browser to disagree with it. The dialog
 * stays on "Saving…" until that page is ready and closes in the same commit.
 * A refusal is said inside the dialog: a toast behind a `<dialog>` is inert
 * and unseen.
 */
export function DashboardCustomise({ view, available, groups }: {
  view: DashboardView;
  available: WidgetKey[];
  groups: GroupKey[];
}) {
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<WidgetKey[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const start = () => {
    setOrder(view.order.filter((key) => available.includes(key)));
    setHidden(view.hidden);
    setFailed(false);
    setOpen(true);
  };

  const toggle = (key: string, show: boolean) =>
    setHidden((was) => (show ? was.filter((h) => h !== key) : [...was.filter((h) => h !== key), key]));

  const move = (index: number, delta: -1 | 1) =>
    setOrder((was) => {
      const next = [...was];
      const to = index + delta;
      if (to < 0 || to >= next.length) return was;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const save = () =>
    startTransition(async () => {
      try {
        // What this role cannot see goes last, in the order it already had.
        const rest = view.order.filter((key) => !available.includes(key));
        await saveDashboardView({ order: [...order, ...rest], hidden });
        // Inside the transition, so it commits with the page the action
        // re-rendered: closed at once, the dialog would uncover the *old*
        // dashboard for as long as the new one took to arrive, which reads
        // as a Save that did nothing.
        startTransition(() => setOpen(false));
      } catch {
        setFailed(true);
      }
    });

  const defaultOrder = DEFAULT_VIEW.order.filter((key) => available.includes(key));
  const draftIsDefault = hidden.length === 0 && order.every((key, i) => key === defaultOrder[i]);
  const changed = !isDefaultView(view);

  return (
    <>
      {/* 32px, not the `sm` button's 44: this row held only the title, and a
          taller control would push the whole dashboard down to make room. The
          page's placeholder for it is the same height. */}
      <Button type="button" variant="secondary" size="sm" className="ml-auto h-8 px-3 py-0" onClick={start}>
        <IconSliders className="size-4" />
        Customise
        {changed && <span className="sr-only"> — this dashboard has been rearranged</span>}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Customise the dashboard"
        description="Which panels you see here, and in what order. It is your own arrangement, kept in this browser."
        footer={
          <>
            <Button
              type="button" variant="ghost" disabled={pending || draftIsDefault}
              onClick={() => { setOrder(defaultOrder); setHidden([]); }}
            >
              Reset<span className="sr-only"> to the default arrangement</span>
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" pending={pending} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
          </>
        }
      >
        {failed && (
          <p role="alert" className="mb-3 rounded-md border border-err/25 bg-err-soft px-3 py-2 text-13 text-err">
            That could not be saved. Try again.
          </p>
        )}

        <ol className="grid gap-2">
          {order.map((key, index) => {
            const widget = WIDGETS.find((w) => w.key === key);
            if (!widget) return null;
            const shown = !hidden.includes(key);

            return (
              <li key={key} className="min-w-0 rounded-lg border border-line-strong bg-card p-3">
                <div className="flex items-start gap-3">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox" checked={shown} onChange={(e) => toggle(key, e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-brand-600"
                    />
                    <span className="min-w-0">
                      <span className="block text-13-5 font-semibold text-ink">{widget.label}</span>
                      <span className="block text-12-5 text-muted">{widget.blurb}</span>
                    </span>
                  </label>
                  <ReorderButtons
                    dense index={index} count={order.length} subject={`“${widget.label}”`}
                    onMove={(delta) => move(index, delta)} disabled={pending}
                  />
                </div>

                {key === "glance" && shown && groups.length > 1 && (
                  <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 pl-6.5">
                    {GROUPS.filter((g) => groups.includes(g.key)).map((g) => (
                      <li key={g.key}>
                        <label className="flex min-h-7 cursor-pointer items-center gap-2 text-13">
                          <input
                            type="checkbox" checked={!hidden.includes(`glance.${g.key}`)}
                            onChange={(e) => toggle(`glance.${g.key}`, e.target.checked)}
                            className="size-4 shrink-0 accent-brand-600"
                          />
                          {g.label}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </Modal>
    </>
  );
}
