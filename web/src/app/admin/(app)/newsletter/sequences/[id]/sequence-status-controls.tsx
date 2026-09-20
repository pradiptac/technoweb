"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/input";
import type { NewsletterSequence } from "@/types/api";
import { deleteSequenceAction, setSequenceStatusAction } from "../../actions";

/**
 * The switch, and the one destructive control.
 *
 * Switching on is the send gate: every step's blocking checks run on the
 * server, and the refusal names the step, so that sentence is shown here in
 * full rather than as "could not". Delete is refused while anybody is still
 * enrolled — the API says how many — and the dialog says what goes with it:
 * the steps and their reports, never the subscribers.
 */
export function SequenceStatusControls({ sequence }: { sequence: NewsletterSequence }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const active = sequence.status === "active";

  const toggle = () => {
    setError(null);
    start(async () => {
      const result = await setSequenceStatusAction(sequence.id, active ? "paused" : "active");
      if (result.error) setError(result.error);
    });
  };

  return (
    <>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Badge tone={active ? "resolved" : "closed"}>{sequence.status_label}</Badge>
        <Button type="button" size="sm" variant={active ? "secondary" : "primary"} pending={pending} onClick={toggle}
          disabled={!active && (sequence.steps?.length ?? 0) === 0}>
          {active ? "Pause" : "Switch on"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="text-err" onClick={() => setDeleting(true)} disabled={pending}>
          Delete
        </Button>
      </div>

      {error && (
        <div className="basis-full">
          <Alert tone="err" title="Not changed">{error}</Alert>
        </div>
      )}

      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this sequence?"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDeleting(false)} disabled={pending}>Keep it</Button>
            <Button
              type="button"
              variant="destructive"
              pending={pending}
              onClick={() => start(async () => {
                const result = await deleteSequenceAction(sequence.id);
                // A refusal comes back; success redirects and never does.
                if (result?.error) { setError(result.error); setDeleting(false); }
              })}
            >
              Delete the sequence
            </Button>
          </>
        }
      >
        <p className="text-13">
          Its steps and their reports go with it. Subscribers stay on the list, and nobody is
          unsubscribed. It cannot be deleted while anybody is still enrolled — pause it or cancel
          their enrolments first.
        </p>
      </Modal>
    </>
  );
}
