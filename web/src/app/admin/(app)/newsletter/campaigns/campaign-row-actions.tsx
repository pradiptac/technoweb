"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { deleteCampaignAction, duplicateCampaignAction } from "../actions";

/*
  Deleting from the list, which is where a draft is actually found.

  The campaign's own screen has a Delete too, and this is not a duplicate of
  it: clearing out half a dozen abandoned drafts through the editor means
  opening, scrolling and coming back six times, which is enough friction that
  nobody does it and the list grows for ever.

  It is offered on a row **only while there are no figures on that row** —
  `sent` is the same flag that decides whether the performance strip renders.
  A one-press control on a list is the wrong shape for something that destroys
  a report: a sent campaign is deleted from its own screen, where the dialog
  can say what goes with it. A draft has nothing to lose but itself.
*/
export function CampaignRowActions({ id, name, sent = false }: { id: number; name: string; sent?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [copying, startCopy] = useTransition();

  /*
    A sent row offers Duplicate and nothing else: the list is where "send
    that one again" is thought of, and it is non-destructive. Delete stays
    off a sent row for the reason above.
  */
  if (sent) {
    return (
      <Button
        type="button" size="sm" variant="ghost" disabled={copying}
        onClick={() => startCopy(() => { void duplicateCampaignAction(id); })}
      >
        {copying ? "Copying…" : "Duplicate"}
      </Button>
    );
  }

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        Delete
      </Button>

      <Modal open={confirming} onClose={() => setConfirming(false)} title={`Delete “${name}”?`}>
        <p className="measure text-13 text-muted">
          Nothing has been sent from this campaign, so the draft is all there is to lose. It
          goes immediately and cannot be brought back.
        </p>
        <p className="measure mt-2 text-13 text-muted">
          Subscribers, groups and the do-not-mail list are untouched — a campaign holds none of
          them, it only addresses them.
        </p>

        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="destructive"
            pending={pending}
            /*
              No try/finally putting `pending` back: the action ends in a
              `redirect()`, which throws by design, so anything after it never
              runs and the screen is replaced regardless.
            */
            onClick={() => start(() => { void deleteCampaignAction(id); })}
          >
            {pending ? "Deleting…" : "Delete the campaign"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>Keep it</Button>
        </div>
      </Modal>
    </>
  );
}
