"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import type { CancelState } from "@/components/events/actions";

const initial: CancelState = {};

/**
 * "Cancel my registration", asked twice.
 *
 * The one press on the registration page that cannot be taken back from
 * that page, so the first press only opens the question — the visit and
 * meeting pages' arrangement. The second is a one-press `<Form>`: nothing is
 * typed into it, and the action arrives already bound to the registration's
 * token by the page, so this component never holds the secret as a value it
 * could post somewhere else.
 *
 * Rendered only while the API says a cancellation would be accepted
 * (`can_cancel`). On success the page re-renders, reports the registration
 * as cancelled in its own words, and this unmounts — which is why success is
 * not a message here. A refusal changes nothing, so it is shown beside the
 * button that is still there.
 */
export function RegistrationManage({
  seats, cancelAction,
}: {
  seats: number;
  cancelAction: (prev: CancelState, formData: FormData) => Promise<CancelState>;
}) {
  const [state, cancel, cancelling] = useActionState(cancelAction, initial);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="grid gap-4">
      {state.error && <Alert tone="err" title="Could not cancel">{state.error}</Alert>}

      {!confirming ? (
        <div>
          <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>Cancel my registration</Button>
        </div>
      ) : (
        <Form action={cancel} className="rounded-lg border border-line-strong bg-card p-4">
          <p className="mb-3 text-14-5 leading-[1.6] text-ink-2">
            Cancel your registration? {seats > 1 ? `All ${seats} seats` : "Your seat"} will be released to somebody else.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="destructive" pending={cancelling}>{cancelling ? "Cancelling…" : "Yes, cancel it"}</Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>Keep my place</Button>
          </div>
        </Form>
      )}
    </div>
  );
}
