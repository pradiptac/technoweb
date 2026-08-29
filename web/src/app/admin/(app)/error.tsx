"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/empty";

/**
 * The console had no error boundary, which is how a failed Server Action
 * became a blank screen.
 *
 * The case worth naming is a **stale build**. `next build` generates a fresh
 * id for every Server Action, so a page still open from a previous deploy
 * posts an id the running server has never heard of: the request 404s and
 * Next throws `UnrecognizedActionError`. Uncaught, that tears down the React
 * tree — the form shows no confirmation, no error, and nothing at all, and the
 * change is lost. It presents as "the setting will not save", which is exactly
 * how it was reported.
 *
 * A toast cannot report this. The error destroys the tree that would render
 * one — that was tried first, and the toast provider is unmounted by the time
 * anything could push to it. A boundary is what survives, because rendering it
 * is Next's response to the throw.
 *
 * **`reset()` is the wrong button for that case and the right one otherwise.**
 * It re-renders the same client bundle, which still holds the same dead action
 * ids, so it fails again identically. Only a full reload fetches the new
 * build. So the stale case offers a reload and the generic case offers a
 * retry, and they are not the same control wearing two labels.
 */
export default function AdminError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  /*
    Matched on the message rather than an error type: Next does not export
    `UnrecognizedActionError`, and the `digest` is a hash rather than a code.
    Checked loosely enough to survive a reword of either half.
  */
  const stale = typeof error?.message === "string"
    && error.message.includes("Server Action")
    && error.message.includes("was not found");

  useEffect(() => {
    // TODO(phase 6): forward to an error tracker rather than the console.
    console.error(error);
  }, [error]);

  if (stale) {
    return (
      <div>
        <ErrorState title="This page is out of date">
          The site was updated while this tab was open, so that action did not
          go through. <strong>Nothing was changed.</strong> Reload the page and
          try again — anything you had typed will need re-entering.
        </ErrorState>
        <button
          type="button"
          // A full reload, not `reset()`: the running bundle is the problem, so
          // re-rendering it changes nothing.
          onClick={() => window.location.reload()}
          className="mt-4 rounded border border-brand-600 bg-brand-600 px-4 py-[11px] text-[13.5px] font-semibold text-white hover:border-brand-700 hover:bg-brand-700"
        >
          Reload the page
        </button>
      </div>
    );
  }

  return (
    <div>
      <ErrorState title="Something went wrong">
        This screen could not be loaded. It has been logged — try again, and if
        it keeps happening, note what you were doing and raise it.
      </ErrorState>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded border border-line-strong bg-card px-4 py-[11px] text-[13.5px] font-semibold hover:border-faint"
      >
        Try again
      </button>
    </div>
  );
}
