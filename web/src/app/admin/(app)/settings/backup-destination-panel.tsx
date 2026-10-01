"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import type { BackupDriveStatus } from "@/types/api";
import type { SettingGroups } from "@/lib/admin";
import {
  connectDriveAction, disconnectDriveAction, forgetSftpKeyAction, testDestinationAction, type BackupActionResult,
} from "../backups/actions";
import { MailboxConnection } from "./mailbox-connection";

const KEYS: Record<string, "s3" | "gdrive" | "ftp"> = { backups_s3: "s3", backups_gdrive: "gdrive", backups_ftp: "ftp" };

/**
 * Under each backup destination's fields: the last refusal it recorded (the
 * `mail_error` pattern — written by a failed upload or test, cleared by a
 * success), a Test button that writes, reads and deletes a small file and
 * reports the destination's own words, and what only that destination has —
 * Drive's consent, SFTP's pinned host key.
 *
 * The test uses what is saved, not what is on screen, which the hint says:
 * a Test that read the form would pass for a password that was never saved.
 */
export function BackupDestinationPanel({
  group, rows, drive,
}: {
  group: string;
  rows: SettingGroups[string];
  drive?: BackupDriveStatus;
}) {
  const key = KEYS[group];
  const [busy, start] = useTransition();
  const [result, setResult] = useState<BackupActionResult>({});
  const value = (k: string) => rows.find((r) => r.key === k)?.value ?? null;
  const isSet = (k: string) => Boolean(rows.find((r) => r.key === k)?.is_set);

  if (!key) return null;

  const lastError = key === "gdrive" ? drive?.error ?? value("backup_gdrive_error") : value(`backup_${key}_error`);
  const configured = key === "s3"
    ? Boolean(value("backup_s3_bucket") && value("backup_s3_key") && isSet("backup_s3_secret"))
    : key === "gdrive"
      ? Boolean(drive?.is_connected)
      : Boolean(value("backup_ftp_host") && value("backup_ftp_username") && (isSet("backup_ftp_password") || isSet("backup_ftp_private_key")));
  const fingerprint = value("backup_ftp_sftp_fingerprint");

  const run = (action: () => Promise<BackupActionResult>) => start(async () => setResult(await action()));

  return (
    <div className="mt-2 border-t border-line pt-4 sm:col-span-2">
      {lastError && !result.ok && !result.error && (
        <Alert tone="warn" title="The last attempt was refused" dismissible={false}>{lastError}</Alert>
      )}
      {result.error && <Alert tone="err" title="That did not work">{result.error}</Alert>}
      {result.ok && !result.error && <Alert tone="ok" title="It worked">{result.ok}</Alert>}

      {key === "gdrive" && drive && (
        <div className="mb-4">
          <MailboxConnection
            account={drive.account}
            connectedAt={drive.connected_at}
            isConnected={drive.is_connected}
            providerLabel="Google"
            busy={busy}
            onConnect={() => run(connectDriveAction)}
            onDisconnect={() => run(disconnectDriveAction)}
            connectLabel="Connect Google Drive"
            emptyLabel="No Google Drive connected"
            disconnectWarning="Backups stop going to Google Drive; the ones already there stay."
            hint={drive.client_configured
              ? "You will be asked to sign in to the Google account whose Drive should hold the backups."
              : "Save the client ID and secret first."}
          />
          <p className="mt-2 text-12-5 text-muted">
            Register this callback on the OAuth client:{" "}
            <code className="font-mono text-12">{drive.callback_path}</code> on this site&apos;s address.
          </p>
        </div>
      )}

      {key === "ftp" && fingerprint && (
        <div className="mb-4 rounded-lg border border-line-strong bg-surface-2 p-3 text-12-5 text-muted">
          <p>
            SFTP host key pinned for <span className="font-mono">{fingerprint.split(" ")[0]}</span>:{" "}
            <span className="font-mono break-all">{fingerprint.split(" ")[1]}</span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("Forget the pinned key? Do this only if the server was rebuilt — a key that changes for no reason can mean somebody is in the middle.")) return;
              run(forgetSftpKeyAction);
            }}
            className="mt-1.5 text-13 font-semibold text-err hover:underline"
          >
            Forget the pinned key
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button" variant="secondary" size="sm" disabled={busy || !configured}
          onClick={() => run(() => testDestinationAction(key))}
        >
          {busy ? "Testing…" : "Test the connection"}
        </Button>
        <p className="measure text-12-5 text-muted">
          {configured
            ? "Uses what is saved, not what is on screen — so save first. Writes, reads back and deletes one small file."
            : key === "gdrive" ? "Connect a Google account first." : "Save the server and its credentials first."}
        </p>
      </div>
    </div>
  );
}
