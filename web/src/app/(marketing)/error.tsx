"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportError } from "@/lib/report-error";
import { Container } from "@/components/ui/container";
import { ErrorState } from "@/components/ui/empty";

/**
 * The public site's error boundary, which did not exist.
 *
 * The console and the portal both had one; the marketing site — the area with
 * by far the most visitors and the only one where the reader has no account and
 * no support line already open — had none at all. A client-side failure there
 * fell through to Next's own default, which in a production build is a bare
 * "Application error: a client-side exception has occurred" on a blank page:
 * no header, no way back, and nothing recorded anywhere.
 *
 * Found while wiring the other two to report, because `site` was a declared
 * area with nothing able to send it.
 *
 * The copy is deliberately not the console's. A visitor cannot "try again and
 * call the support line" — they do not have one — so this offers the two things
 * that actually help: reload, and a way back to a page that works.
 */
export default function MarketingError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  /*
    A tab left open across a deploy posts a Server Action id the running build
    has never heard of. `reset()` cannot fix it — the stale bundle *is* the
    problem, so re-rendering fails identically — which is why this branch offers
    a reload instead. Same reasoning as the console's boundary.
  */
  const stale = typeof error?.message === "string"
    && error.message.includes("Server Action")
    && error.message.includes("was not found");

  useEffect(() => {
    console.error(error);
    reportError("site", error);
  }, [error]);

  return (
    <Container className="section-y">
      {stale ? (
        <>
          <ErrorState title="This page is out of date">
            The site was updated while this tab was open, so that did not go through.{" "}
            <strong>Nothing was sent.</strong> Reload the page and try again.
          </ErrorState>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded border border-brand-600 bg-brand-600 px-4 py-[11px] text-[13.5px] font-semibold text-white transition-colors hover:border-brand-700 hover:bg-brand-700"
          >
            Reload the page
          </button>
        </>
      ) : (
        <>
          <ErrorState title="Something went wrong">
            We could not display this page. It has been logged and we will look at it.
          </ErrorState>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded border border-line-strong bg-card px-4 py-[11px] text-[13.5px] font-semibold transition-colors hover:border-faint"
            >
              Try again
            </button>
            {/*
              `next/link` here and a hard reload in the stale branch above, which
              is the distinction that matters. This branch is an ordinary render
              failure in one segment: the router is intact and a client-side
              navigation away from the broken route works. The stale-deploy
              branch is the case where the bundle itself is wrong, and there
              nothing client-side can help — hence a full document load.
            */}
            <Link
              href="/"
              className="rounded border border-brand-600 bg-brand-600 px-4 py-[11px] text-[13.5px] font-semibold text-white transition-colors hover:border-brand-700 hover:bg-brand-700"
            >
              Go to the homepage
            </Link>
          </div>
        </>
      )}
    </Container>
  );
}
