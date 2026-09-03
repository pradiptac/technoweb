"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";
import { ErrorState } from "@/components/ui/empty";

export default function PortalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  /*
    A page open across a deploy posts a Server Action id the running build has
    never heard of, and the uncaught throw tears the tree down — so a ticket
    reply silently does nothing. `reset()` cannot fix it: the stale bundle is
    the problem, so re-rendering it fails identically. See the console's own
    boundary for the full reasoning.
  */
  const stale = typeof error?.message === "string"
    && error.message.includes("Server Action")
    && error.message.includes("was not found");

  useEffect(() => {
    /*
      Reported to the API as well as logged.
      
      This was `console.error` alone, with a TODO beside it — which recorded the
      failure in a console nobody was watching, on a device we do not have. The
      console line stays, because it is what a developer with the tab open
      actually reads; the report is what makes it visible to anybody else.
    */
    console.error(error);
    reportError("portal", error);
  }, [error]);

  if (stale) {
    return (
      <div>
        <ErrorState title="This page is out of date">
          The site was updated while this tab was open, so that did not go
          through. <strong>Nothing was changed.</strong> Reload the page and try
          again.
        </ErrorState>
        <button
          type="button"
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
        We could not load this page. This has been logged — try again, and if it keeps
        happening, call the support line and we will raise the ticket for you.
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
