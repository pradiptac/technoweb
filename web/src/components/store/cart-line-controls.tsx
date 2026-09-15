"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { IconTrash } from "@/components/icons-ui";
import { removeCartLineAction, updateCartLineAction } from "@/components/store/actions";
import { announceBasketChange } from "@/lib/basket-events";
import { formatPaise } from "@/lib/money";
import { Button } from "@/components/ui/button";

/**
 * A basket line's quantity and its total, kept in step on the screen before
 * the server has answered.
 *
 * The quantity saves itself half a second after the last keystroke (long
 * enough to finish typing, short enough that nobody wonders whether it took)
 * and the action revalidates the page's totals. What was missing was the
 * line's own figure: it waited for the round trip, so for half a second and a
 * request the row said "3" beside a price for two. The total is worked out
 * here from the unit price the row already carries — the same arithmetic the
 * API does, on the same two numbers — and the server's answer replaces it
 * when it lands. The summary beside the list is the server's alone: a
 * discount code or a stock cap can change it in ways this row cannot know.
 *
 * Still a plain form underneath, so the quantity works with no JavaScript;
 * the Update button shows only then, and Enter is left to the form only then.
 * `useSyncExternalStore` is how "are scripts running" is read without a
 * `setState` in an effect — `lib/consent.ts`'s rule.
 */
export function CartLineQuantity({
  id, name, quantity, unitPricePaise, lineTotalPaise,
}: {
  id: number; name: string; quantity: number; unitPricePaise: number; lineTotalPaise: number;
}) {
  const [value, setValue] = useState(String(quantity));
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scripted = useSyncExternalStore(() => () => {}, () => true, () => false);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const n = Number(value);
  const typed = value !== "" && !Number.isNaN(n) ? Math.max(0, Math.min(99, n)) : null;
  // Optimistic while the server has not caught up; the server's figure once it has.
  const total = typed !== null && typed !== quantity ? typed * unitPricePaise : lineTotalPaise;

  const save = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const q = Number(next);
      if (next === "" || Number.isNaN(q) || q === quantity) return;
      start(async () => {
        const data = new FormData();
        data.set("id", String(id));
        data.set("quantity", String(Math.max(0, Math.min(99, q))));
        await updateCartLineAction(data);
        announceBasketChange();
      });
    }, 500);
  };

  return (
    <div className="flex items-center gap-4">
      <form action={updateCartLineAction} className="flex items-center gap-1.5">
        <input type="hidden" name="id" value={id} />
        <label htmlFor={`qty-${id}`} className="sr-only">Quantity of {name}</label>
        <input
          id={`qty-${id}`}
          name="quantity"
          type="number"
          min={0}
          max={99}
          value={value}
          onChange={(e) => { setValue(e.target.value); save(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter" && scripted) e.preventDefault(); }}
          className="w-16 rounded border border-line-strong bg-surface px-2 py-1.5 text-14"
        />
        {!scripted && <Button type="submit" size="sm" variant="secondary">Update</Button>}
        <span role="status" className="text-12 text-faint">{pending ? "Saving…" : ""}</span>
      </form>

      <div className="text-right">
        <p className={`text-15 font-semibold tabular-nums transition-opacity duration-(--duration-base) ${pending ? "opacity-60" : ""}`}>
          {formatPaise(total)}
        </p>
        <p className="text-12 text-faint tabular-nums">{formatPaise(unitPricePaise)} each</p>
      </div>
    </div>
  );
}

/**
 * The remove control, still a form — the no-JS path is free here — that,
 * with scripts, lets the row leave before the list re-renders without it.
 *
 * On submit the row is marked `data-leaving` and the action runs after
 * `--duration-exit`; `globals.css` fades and slides it out over that time,
 * inside the reduced-motion guard. A row that snapped out of the list was
 * the one thing on the page that happened with no motion at all, which read
 * as the page having lost something rather than as the person removing it.
 */
export function RemoveLineForm({ id, name }: { id: number; name: string }) {
  const [, start] = useTransition();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const row = e.currentTarget.closest("li");
    row?.setAttribute("data-leaving", "");
    const data = new FormData(e.currentTarget);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
      start(async () => {
        await removeCartLineAction(data);
        announceBasketChange();
      });
    }, reduced ? 0 : 140);
  };

  return (
    <form action={removeCartLineAction} onSubmit={onSubmit} className="mt-1 flex justify-end">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label={`Remove ${name} from the basket`}
        title="Remove"
        className="grid size-6 place-items-center rounded text-err transition-colors hover:bg-err-soft"
      >
        <IconTrash className="size-[15px]" />
      </button>
    </form>
  );
}
