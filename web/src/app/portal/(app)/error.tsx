"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/empty";

export default function PortalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // TODO(phase 6): forward to an error tracker rather than the console.
    console.error(error);
  }, [error]);

  return (
    <div>
      <ErrorState title="Something went wrong">
        We could not load this page. This has been logged — try again, and if it keeps
        happening, call the support line and we will raise the ticket for you.
      </ErrorState>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded border border-line-strong bg-white px-4 py-[11px] text-[13.5px] font-semibold hover:border-faint"
      >
        Try again
      </button>
    </div>
  );
}
