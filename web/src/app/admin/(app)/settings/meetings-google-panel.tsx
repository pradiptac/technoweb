"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import type { SettingGroups } from "@/lib/admin";
import type { MeetingsGoogleStatus } from "@/types/meetings";
import {
  connectMeetingsGoogleAction, disconnectMeetingsGoogleAction, testMeetingsGoogleAction, type MeetingResult,
} from "../meetings/actions";
import { MailboxConnection } from "./mailbox-connection";

/**
 * Under the Google Calendar fields on Meeting settings: the Workspace
 * account every meeting is organised on, Connect or Disconnect, a Test that
 * uses what is saved, and the last refusal Google gave (the `mail_error`
 * pattern — written by a failed sync or test, cleared by a success). The
 * backups Drive panel's arrangement, on its own OAuth slot.
 *
 * Disconnecting with synced future meetings says how many: their events stay
 * in Google, but moving or cancelling one from here no longer reaches them.
 */
export function MeetingsGooglePanel({ status, rows }: { status?: MeetingsGoogleStatus; rows: SettingGroups[string] }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<MeetingResult>({});
  const run = (action: () => Promise<MeetingResult>) => start(async () => setResult(await action()));

  const lastError = status?.error ?? rows.find((r) => r.key === "meetings_google_error")?.value ?? null;

  if (!status) {
    return (
      <div className="mt-2 border-t border-line pt-4 sm:col-span-2">
        <Alert tone="warn" title="The connection could not be read" dismissible={false}>
          The Google Calendar status did not load. The fields above still save; reload to try again.
        </Alert>
      </div>
    );
  }

  const future = status.synced_future_count;
  const warning = future > 0
    ? `${future} upcoming meeting${future === 1 ? " is" : "s are"} in Google Calendar. ${future === 1 ? "Its event stays" : "Their events stay"} there, but moving or cancelling ${future === 1 ? "it" : "them"} from here will no longer update Google — customers get a calendar file instead.`
    : "New meetings get a calendar file instead of a Google invitation and a Meet link until it is connected again.";

  return (
    <div className="mt-2 border-t border-line pt-4 sm:col-span-2">
      {lastError && !result.ok && !result.error && (
        <Alert tone="warn" title="The last attempt was refused" dismissible={false}>{lastError}</Alert>
      )}
      {result.error && <Alert tone="err" title="That did not work">{result.error}</Alert>}
      {result.ok && !result.error && <Alert tone="ok" title="Done">{result.ok}</Alert>}

      <div className="mb-4">
        <MailboxConnection
          account={status.account}
          connectedAt={status.connected_at}
          isConnected={status.is_connected}
          providerLabel="Google"
          busy={busy}
          onConnect={() => run(connectMeetingsGoogleAction)}
          onDisconnect={() => run(disconnectMeetingsGoogleAction)}
          connectLabel="Connect Google Calendar"
          emptyLabel="No Google Calendar connected"
          disconnectWarning={warning}
          hint={status.client_configured
            ? "Sign in as the Workspace account meetings should be organised on — meetings@, not a person's own account."
            : "Save the client ID and secret first."}
        />
        {status.is_connected && future > 0 && (
          <p className="mt-2 text-12-5 text-muted">
            {future} upcoming meeting{future === 1 ? " is" : "s are"} in this calendar.
          </p>
        )}
        <p className="mt-2 text-12-5 text-muted">
          Register this callback on the OAuth client:{" "}
          <code className="font-mono text-12">{status.callback_path}</code> on this site&apos;s address.
          {status.calendar_id && <> Events go to <code className="font-mono text-12">{status.calendar_id}</code>.</>}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button" variant="secondary" size="sm" disabled={busy || !status.is_connected}
          onClick={() => run(testMeetingsGoogleAction)}
        >
          {busy ? "Testing…" : "Test the connection"}
        </Button>
        <p className="measure text-12-5 text-muted">
          {status.is_connected
            ? "Uses what is saved, not what is on screen — so save first. Google's answer is shown here in its own words."
            : "Connect a Google account first."}
        </p>
      </div>
    </div>
  );
}
