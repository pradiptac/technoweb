"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Input } from "@/components/ui/input";
import type { SettingGroups } from "@/lib/admin";
import { formatDate } from "@/lib/dates";
import type { LinkedInOrganization, SocialAccountsStatus } from "@/types/social-posts";
import { MailboxConnection } from "./mailbox-connection";
import {
  chooseLinkedInOrganizationAction, connectLinkedInAction, disconnectLinkedInAction,
  listLinkedInOrganizationsAction, type SocialResult,
} from "./social-actions";

const WEEK = 7 * 24 * 3600 * 1000;

/**
 * Under the LinkedIn fields on Settings → Social accounts (C7): the account
 * the posts go out as, Connect or Disconnect, which LinkedIn page they go to
 * (chosen from the pages that account administers, or typed when LinkedIn will
 * not list them), a warning from a week before the token runs out, and the
 * last refusal LinkedIn gave. The meetings calendar panel's arrangement on its
 * own OAuth slot. It sits inside the settings `<form>`, so every control is
 * unnamed and a `button` — nothing here is saved by the Save button.
 *
 * X has no card: posting there directly needs a paid developer plan, so an
 * approved X post opens in X with the text filled in.
 */
export function SocialAccountsPanel({ status, rows }: { status?: SocialAccountsStatus; rows: SettingGroups[string] }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<SocialResult>({});
  const [pages, setPages] = useState<LinkedInOrganization[] | null>(null);
  const [typedId, setTypedId] = useState("");
  // A lazy initialiser: the clock is read once, not on every render.
  const [now] = useState(() => Date.now());
  const run = (action: () => Promise<SocialResult>, after?: (r: SocialResult) => void) => start(async () => {
    const r = await action();
    setResult(r);
    after?.(r);
  });

  if (!status) {
    return (
      <div className="mt-2 border-t border-line pt-4 sm:col-span-2">
        <Alert tone="warn" title="The connection could not be read" dismissible={false}>
          The LinkedIn status did not load. The fields above still save; reload to try again.
        </Alert>
      </div>
    );
  }

  const li = status.linkedin;
  const lastError = li.error ?? rows.find((r) => r.key === "social_linkedin_error")?.value ?? null;
  const expires = li.expires_at ? new Date(li.expires_at) : null;
  const expired = expires !== null && expires.getTime() <= now;
  const soon = expires !== null && !expired && expires.getTime() - now <= WEEK;

  const choose = (id: string, name: string | null) => run(() => chooseLinkedInOrganizationAction(id, name), (r) => {
    if (r.ok) { setPages(null); setTypedId(""); }
  });

  return (
    <div className="mt-2 border-t border-line pt-4 sm:col-span-2">
      {lastError && !result.ok && !result.error && (
        <Alert tone="warn" title="The last attempt was refused" dismissible={false}>{lastError}</Alert>
      )}
      {result.error && <Alert tone="err" title="That did not work">{result.error}</Alert>}
      {result.ok && !result.error && <Alert tone="ok" title="Done">{result.ok}</Alert>}
      {li.connected && expired && (
        <Alert tone="warn" title="The connection has expired" dismissible={false}>
          LinkedIn&apos;s access ran out on {formatDate(li.expires_at, "long")}, so approving a post copies the text and opens LinkedIn
          for you to post by hand. Connect again to publish from here.
        </Alert>
      )}
      {li.connected && soon && (
        <Alert tone="warn" title={`Reconnect LinkedIn by ${formatDate(li.expires_at, "long")}`} dismissible={false}>
          LinkedIn&apos;s access lasts for a limited time. After that, approving a post copies the text and opens LinkedIn for you to post by hand.
        </Alert>
      )}

      <div className="mb-4">
        <MailboxConnection
          account={li.account ?? "LinkedIn"}
          connectedAt={null}
          isConnected={li.connected}
          providerLabel="LinkedIn"
          busy={busy}
          onConnect={() => run(connectLinkedInAction)}
          onDisconnect={() => run(disconnectLinkedInAction)}
          connectLabel="Connect LinkedIn"
          emptyLabel="LinkedIn is not connected"
          disconnectWarning="Approved posts will copy the text and open LinkedIn for you to post by hand until it is connected again."
          hint={li.configured
            ? "Sign in as someone who administers the company's LinkedIn page."
            : "Save the client ID and secret first."}
        />
        <p className="mt-2 text-12-5 text-muted">
          Register this callback on the LinkedIn app:{" "}
          <code className="font-mono text-12">{li.callback_path}</code> on this site&apos;s address.
          {li.expires_at && li.connected && !expired && <> Access runs until {formatDate(li.expires_at, "long")}.</>}
        </p>
      </div>

      {li.connected && (
        <div className="mb-4 rounded-lg border border-line-strong bg-surface-2 p-4">
          <p className="text-13-5 font-semibold text-ink">
            {li.organization
              ? <>Posts go to {li.organization.name ?? <>the page with ID <code className="font-mono text-12-5">{li.organization.id}</code></>}</>
              : "Choose the LinkedIn page posts go to"}
          </p>
          {!li.organization && (
            <p className="measure mt-0.5 text-12-5 text-muted">Until a page is chosen, approving a post opens LinkedIn instead of publishing.</p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <Button
              type="button" variant="secondary" size="sm" disabled={busy}
              onClick={() => run(listLinkedInOrganizationsAction, (r) => setPages(r.organizations ?? null))}
            >
              {busy && pages === null ? "Asking LinkedIn…" : li.organization ? "Choose another page" : "Choose a page"}
            </Button>
          </div>

          {pages && pages.length === 0 && (
            <p className="mt-2 text-12-5 text-muted">LinkedIn listed no pages for this account. Type the page&apos;s ID below.</p>
          )}
          {pages && pages.length > 0 && (
            <ul className="mt-2.5 grid gap-1.5">
              {pages.map((page) => (
                <li key={page.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 text-13">{page.name ?? `Page ${page.id}`} <span className="font-mono text-12 text-muted">{page.id}</span></span>
                  <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => choose(page.id, page.name)}>Use this page</Button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <label htmlFor="social-linkedin-org-id" className="mb-0.5 block text-11 font-semibold text-faint">Or type the page&apos;s ID</label>
              <Input
                id="social-linkedin-org-id" inputMode="numeric" autoComplete="off" placeholder="e.g. 12345678"
                value={typedId} onChange={(e) => setTypedId(e.target.value.replace(/\D/g, "").slice(0, 20))}
                // Enter here would submit the whole settings form.
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (typedId) choose(typedId, null); } }}
              />
            </div>
            <Button type="button" size="sm" disabled={busy || typedId === ""} onClick={() => choose(typedId, null)}>Use this ID</Button>
          </div>
          <p className="measure mt-1.5 text-12-5 text-muted">The ID is the number in the page&apos;s admin address on LinkedIn.</p>
        </div>
      )}

      <p className="measure text-12-5 text-muted">
        <strong className="font-semibold text-ink">X.</strong>{" "}
        Posting to X directly needs a paid X developer plan; for now approved X posts open in X, filled in.
      </p>
    </div>
  );
}
