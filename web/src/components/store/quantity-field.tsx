"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateCartLineAction } from "@/app/(marketing)/store/actions";

/**
 * A basket quantity that saves itself.
 *
 * **The Update button is still here**, and that is the point of the shape.
 * The form it replaced carried a comment saying the quantity works with no
 * JavaScript at all — "which is what a shop should do, and is free here because
 * the action is a server one" — and simply deleting the button to save a click
 * would have quietly taken that away. So the button renders, and hides itself
 * once JavaScript has run. With scripts off it is still there and still works.
 *
 * **Debounced, not fired per keystroke.** React's `onChange` is the DOM's
 * `input` event, so typing "12" would otherwise send a 1 and then a 12 — two
 * writes, two revalidations, and a basket that briefly held the wrong number.
 * Half a second is long enough to finish typing and short enough that nobody
 * wonders whether it took.
 *
 * The value is not read back from the server afterwards. It is a controlled
 * input the person is looking at, and replacing what they typed with what came
 * back is how a field fights its own user — the action revalidates the totals
 * around it, which is the part that has to agree.
 */
export function QuantityField({ id, name, quantity }: { id: number; name: string; quantity: number }) {
  const [value, setValue] = useState(String(quantity));
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
    Whether scripts are running — false on the server, true once hydrated.

    `useSyncExternalStore` rather than an effect that sets state, which is what
    `react-hooks/set-state-in-effect` refuses and refused here. The subscribe
    function is a no-op because the answer never changes after the first paint;
    the two snapshots are the whole point. `lib/consent.ts` reads its stored
    choice the same way, and for the same reason: the server has no idea and
    must not guess.
  */
  const scripted = useSyncExternalStore(() => () => {}, () => true, () => false);

  // Only to stop a pending save firing after the row has gone.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const save = (next: string) => {
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      const n = Number(next);

      // Nothing to say. Zero is meaningful — the API reads it as "remove this
      // line" — so it is only an empty box or a bad number that is ignored.
      if (next === "" || Number.isNaN(n) || n === quantity) return;

      start(async () => {
        const data = new FormData();
        data.set("id", String(id));
        data.set("quantity", String(Math.max(0, Math.min(99, n))));
        await updateCartLineAction(data);
      });
    }, 500);
  };

  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={`qty-${id}`} className="sr-only">Quantity of {name}</label>
      <input
        id={`qty-${id}`}
        name="quantity"
        type="number"
        min={0}
        max={99}
        value={value}
        onChange={(e) => { setValue(e.target.value); save(e.target.value); }}
        // Enter would submit the surrounding form and reload the page, which is
        // the right no-JS behaviour and a jarring one once this saves by itself.
        onKeyDown={(e) => { if (e.key === "Enter" && scripted) e.preventDefault(); }}
        disabled={pending}
        className="w-16 rounded border border-line-strong bg-surface px-2 py-1.5 text-[14px] disabled:opacity-60"
      />

      {!scripted && <Button type="submit" size="sm" variant="secondary">Update</Button>}

      {/*
        `role="status"`, and mounted empty rather than appearing with its text
        already inside it — a live region that arrives complete has not
        *changed*, so nothing is announced. The rule `PasswordField` documents
        for its Caps Lock warning.
      */}
      <span role="status" className="text-[12px] text-faint">
        {pending ? "Saving…" : ""}
      </span>
    </div>
  );
}
