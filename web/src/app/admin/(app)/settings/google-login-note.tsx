"use client";

import { useSyncExternalStore } from "react";

import { CopyText } from "@/components/admin/copy-text";
import { Alert } from "@/components/ui/input";
import { GOOGLE_CALLBACK_PATH } from "@/lib/google-signin";

/** The address this console was opened at — the website's own, since they are one application. */
const subscribe = () => () => {};
const origin = () => window.location.origin;

/**
 * Under the three Google sign-in rows (docs/auth.md "Signing in with
 * Google"): the one address that has to be typed into Google exactly, with a
 * Copy button, and whether the switch is doing anything yet.
 *
 * The address is read in the browser because only the browser knows the
 * origin the site is reachable at — `FRONTEND_URL` on the API is the
 * production domain on every machine. `useSyncExternalStore` with an empty
 * server snapshot, so the server's HTML and the first client render agree.
 */
export function GoogleLoginNote({ enabled, hasId, hasSecret }: { enabled: boolean; hasId: boolean; hasSecret: boolean }) {
  const site = useSyncExternalStore(subscribe, origin, () => "");
  const redirect = site ? `${site}${GOOGLE_CALLBACK_PATH}` : GOOGLE_CALLBACK_PATH;
  const ready = hasId && hasSecret;

  return (
    <div className="mb-[18px] grid min-w-0 gap-3 rounded-lg border border-line-strong bg-surface p-4 sm:col-span-2">
      {enabled && !ready && (
        <Alert tone="warn" title="Switched on, but not offered yet" dismissible={false}>
          The button appears on the sign-in and registration screens once both the client ID and the client secret
          are saved.
        </Alert>
      )}

      <div className="min-w-0">
        <p className="text-13-5 font-semibold">Authorised redirect URI</p>
        <p className="mt-1 text-13 text-muted">
          In Google Cloud, open your OAuth client (type <span className="font-semibold">Web application</span>) and
          add this address under <span className="font-semibold">Authorised redirect URIs</span>, exactly as written.
        </p>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          {/* `w-0 min-w-full` on a scroller inside a grid: it must not widen the column (CLAUDE.md). */}
          <pre className="w-0 min-w-full flex-1 overflow-x-auto rounded-md border border-line-strong bg-card px-3 py-2 font-mono text-12-5 sm:min-w-0">
            {redirect}
          </pre>
          <CopyText text={redirect} what="The redirect address" />
        </div>
      </div>

      <p className="text-13 text-muted">
        Customers who use it are found by their Google email address: an existing account is signed in, and a new
        address gets a new account — while registration is open, and waiting for approval if you require it. Staff
        sign-in to this console is not affected.
      </p>
    </div>
  );
}
