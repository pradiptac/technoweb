"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/input";
import { wishlistAlertsAction, type WishlistAlertsState } from "@/components/store/wishlist-actions";

const initial: WishlistAlertsState = {};

/**
 * "Email me about these", for a guest whose list has no address — the only
 * way a guest is ever told a saved thing is back or cheaper. A `<Form>` with
 * `state`, so a refused address comes back filled in.
 */
export function WishlistEmailForm() {
  const [state, formAction, pending] = useActionState(wishlistAlertsAction, initial);

  if (state.ok) {
    return <Alert tone="ok" title="We'll let you know." dismissible={false}>{state.ok}</Alert>;
  }

  return (
    <Form action={formAction} state={state} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
      <Field label="Your email" htmlFor="wishlist-email" error={state.fieldErrors?.email} className="mb-0">
        <Input id="wishlist-email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" pending={pending} className="sm:mt-0">Email me about these</Button>
      {state.error && <Alert tone="err" title="That did not save">{state.error}</Alert>}
    </Form>
  );
}

/**
 * Switch the list's emails back on, after its stop link was pressed — or off,
 * from the portal. One press, no field: the hidden `alerts` is the whole of
 * what it says.
 */
export function WishlistAlertsToggle({ on }: { on: boolean }) {
  const [state, formAction, pending] = useActionState(wishlistAlertsAction, initial);

  if (state.ok) {
    return <Alert tone="ok" title="Done" dismissible={false}>{state.ok}</Alert>;
  }

  return (
    <Form action={formAction} state={state} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="alerts" value={on ? "1" : "0"} />
      <Button type="submit" variant="secondary" size="sm" pending={pending}>
        {on ? "Email me about this list again" : "Stop emails about this list"}
      </Button>
      {state.error && <Alert tone="err" title="That did not save">{state.error}</Alert>}
    </Form>
  );
}
