"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Modal } from "@/components/ui/modal";
import { formatDate, relativeTime } from "@/lib/dates";
import type {
  BackupIndex, BackupRestoreSummary, BackupSummary, RemoteBackupFolder,
} from "@/types/api";
import {
  afterRestoreAction, cancelRestoreAction, deleteBackupAction, destinationFoldersAction, pollBackupsAction,
  startBackupAction, startRestoreAction,
} from "./actions";

const RUNNING = ["pending", "dumping", "indexing", "archiving", "uploading"];
const RESTORING = ["pending", "safety", "downloading", "importing", "files", "finishing"];

const STEP: Record<string, string> = {
  pending: "Waiting for the backup worker",
  dumping: "Dumping the database",
  indexing: "Listing the files",
  archiving: "Packing the files",
  uploading: "Sending to the destinations",
};

const RESTORE_STEP: Record<string, string> = {
  pending: "Waiting for the backup worker",
  safety: "Taking a safety copy of the current database",
  downloading: "Fetching the backup and checking it",
  importing: "Replacing the database",
  files: "Putting the files back",
  finishing: "Finishing",
};

const STATUS: Record<string, { label: string; tone: "resolved" | "progress" | "urgent" | "closed" | "open" }> = {
  completed: { label: "Complete", tone: "resolved" },
  completed_with_errors: { label: "Partly sent", tone: "progress" },
  failed: { label: "Failed", tone: "urgent" },
  cancelled: { label: "Cancelled", tone: "closed" },
};

const LABELS: Record<string, string> = { s3: "S3", gdrive: "Google Drive", ftp: "FTP / SFTP", local: "This server" };

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** What to restore: a backup this server remembers, or a folder found on a destination. */
type Target =
  | { kind: "local"; backup: BackupSummary }
  | { kind: "remote"; destination: string; folder: RemoteBackupFolder };

/**
 * The Backups screen. Server-rendered once, then polled every few seconds
 * while a backup or a restore is moving — the worker runs once a minute on
 * the scheduler, so the numbers step rather than stream, and the screen says
 * which step it is on rather than drawing a bar that would sit still.
 */
export function BackupsScreen({ initial }: { initial: BackupIndex }) {
  const [index, setIndex] = useState(initial);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [misses, setMisses] = useState(0);
  const [busy, start] = useTransition();
  const refreshed = useRef<number | null>(null);

  const { meta, data } = index;
  const running = meta.running && RUNNING.includes(meta.running.status) ? meta.running : null;
  const restore = meta.restore;
  const restoring = Boolean(restore && RESTORING.includes(restore.status));
  const moving = Boolean(running) || restoring || meta.restoring;

  // Poll while something is moving. The state is set in the timer's callback,
  // never in the effect's body.
  useEffect(() => {
    if (!moving) return;

    const timer = window.setInterval(async () => {
      const next = await pollBackupsAction();

      if (next) {
        setIndex(next);
        setMisses(0);
      } else {
        setMisses((n) => n + 1);
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [moving]);

  // A restore that has just completed: every cached public page was rendered
  // from the database that was replaced, so drop the site's cache, once.
  useEffect(() => {
    if (restore?.status === "completed" && refreshed.current !== restore.id && restore.finished_at
      && Date.now() - new Date(restore.finished_at).getTime() < 10 * 60 * 1000) {
      refreshed.current = restore.id;
      void afterRestoreAction();
    }
  }, [restore?.status, restore?.id, restore?.finished_at]);

  const refresh = async () => {
    const next = await pollBackupsAction();
    if (next) setIndex(next);
  };

  const backUp = (type: "full" | "incremental") => start(async () => {
    const result = await startBackupAction(type);
    setNotice(result.error
      ? { tone: "err", text: result.error }
      : { tone: "ok", text: `A ${type} backup is queued. The backup worker picks it up within a minute.` });
    await refresh();
  });

  const remove = (backup: BackupSummary, cancelling: boolean) => {
    const question = cancelling
      ? "Cancel this backup? What it has sent so far stays where it is."
      : `Delete the backup of ${formatDate(backup.created_at, "dateTime")}? It is removed from every destination and from this server.`;
    if (!window.confirm(question)) return;

    start(async () => {
      const result = await deleteBackupAction(backup.id);
      setNotice(result.error ? { tone: "err", text: result.error } : { tone: "ok", text: cancelling ? "Cancelled." : "Deleted." });
      await refresh();
    });
  };

  const enabled = meta.destinations.filter((d) => d.enabled && d.configured);
  const schedulerDown = meta.scheduler.known !== false && meta.scheduler.running === false;

  return (
    <div className="grid gap-5">
      {notice && <Alert tone={notice.tone} title={notice.tone === "ok" ? "Done" : "That did not work"}>{notice.text}</Alert>}

      {meta.restoring && (
        <Alert tone="warn" title="The site is being restored" dismissible={false}>
          Everything but this screen answers “try again in a few minutes” until it finishes. The public pages
          keep showing what they had cached.
        </Alert>
      )}

      {misses >= 3 && moving && (
        <Alert tone="warn" title="This screen has lost touch with the server" dismissible={false}>
          A restore replaces the accounts table too, so the session you started it with may no longer exist. Signing
          in works again once the database is back — usually within a few minutes.{" "}
          <Link href="/admin/login" className="font-semibold underline">Sign in again</Link> to see how it finished.
        </Alert>
      )}

      {meta.error && (
        <Alert tone="err" title="The last backup did not complete" dismissible={false}>{meta.error}</Alert>
      )}

      {schedulerDown && (
        <Alert tone="err" title="The scheduler is not running on this server" dismissible={false}>
          Nothing backs up by itself, and “Back up now” waits for ever. Add the cron entry{" "}
          <code className="font-mono text-12-5">* * * * * cd /path/to/api &amp;&amp; php artisan schedule:run</code>, or
          run <code className="font-mono text-12-5">php artisan technoware:backup --wait</code> at a terminal.
        </Alert>
      )}

      {enabled.length === 0 && (
        <Alert tone="info" title="No destination is switched on" dismissible={false}>
          Backups are kept on this server only — which does not help if this server is what is lost.{" "}
          <Link href="/admin/backups/settings" className="font-semibold underline">Set up S3, Google Drive or FTP</Link>.
        </Alert>
      )}

      <StatusCards index={index} />

      <Card interactive={false} padding="md" as="section">
        <h2 className="text-15 font-semibold text-ink">Back up now</h2>
        <p className="measure mt-1 text-13 text-muted">
          {meta.schedule.enabled
            ? "Outside the schedule — before a deploy, say. It goes to every destination that is switched on."
            : "Scheduled backups are off, so this is the only way a backup is made."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy || moving} pending={busy} onClick={() => backUp("full")}>Full backup</Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy || moving} onClick={() => backUp("incremental")}>
            Incremental backup
          </Button>
        </div>

        {running && <RunningBackup backup={running} busy={busy} onCancel={() => remove(running, true)} />}
      </Card>

      {restore && <RestorePanel restore={restore} onChange={refresh} />}

      <section>
        <h2 className="mb-2 text-15 font-semibold text-ink">Backups</h2>
        {data.length === 0 ? (
          <EmptyState title="No backups yet">Press Full backup above, or switch the schedule on under Backup settings.</EmptyState>
        ) : (
          <BackupTable backups={data} busy={busy || moving} onRestore={(b) => setTarget({ kind: "local", backup: b })} onDelete={(b) => remove(b, false)} />
        )}
      </section>

      <FindOnDestination destinations={meta.destinations} disabled={moving} onRestore={(destination, folder) => setTarget({ kind: "remote", destination, folder })} />

      {target && (
        <RestoreDialog
          target={target}
          onClose={() => setTarget(null)}
          onStarted={async () => {
            setTarget(null);
            setNotice({ tone: "ok", text: "The restore is queued. A safety copy of the current database is taken first." });
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function StatusCards({ index }: { index: BackupIndex }) {
  const { meta } = index;
  const s = meta.schedule;
  const days: Record<string, string> = { daily: "every day", mon: "Mondays", tue: "Tuesdays", wed: "Wednesdays", thu: "Thursdays", fri: "Fridays", sat: "Saturdays", sun: "Sundays" };

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card interactive={false} padding="md">
        <p className="text-12 font-semibold uppercase tracking-[.06em] text-faint">Last complete backup</p>
        <p className="mt-1 text-17 font-semibold text-ink">{meta.last_success ? relativeTime(meta.last_success) : "Never"}</p>
        {meta.last_success && <p className="text-12-5 text-muted">{formatDate(meta.last_success, "dateTime")}</p>}
      </Card>
      <Card interactive={false} padding="md">
        <p className="text-12 font-semibold uppercase tracking-[.06em] text-faint">Schedule</p>
        <p className="mt-1 text-17 font-semibold text-ink">{s.enabled ? `Next ${meta.next_run ? relativeTime(meta.next_run) : "—"}` : "Off"}</p>
        <p className="text-12-5 text-muted">
          {s.enabled
            ? `Full ${days[s.full_day] ?? s.full_day} at ${s.time}${s.incremental_every ? `, incremental every ${s.incremental_every} h` : ""}. Keeps ${s.keep_chains}.`
            : "Switch it on under Backup settings."}
        </p>
      </Card>
      <Card interactive={false} padding="md">
        <p className="text-12 font-semibold uppercase tracking-[.06em] text-faint">Destinations</p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {meta.destinations.map((d) => (
            <li key={d.key}>
              <Badge tone={!d.enabled ? "closed" : d.error ? "urgent" : d.configured ? "resolved" : "progress"}>
                {d.label}{!d.enabled ? " · off" : !d.configured ? " · not set up" : d.error ? " · refused" : ""}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>
      <Card interactive={false} padding="md">
        <p className="text-12 font-semibold uppercase tracking-[.06em] text-faint">This server</p>
        <p className="mt-1 text-17 font-semibold text-ink">{formatBytes(meta.disk_free)} free</p>
        <p className="text-12-5 text-muted">
          Database dumped with {meta.dumper.chosen === "mysqldump" ? "mysqldump" : "PHP"}
          {meta.dumper.binary ? "" : " — mysqldump is not available here"}.
        </p>
      </Card>
    </div>
  );
}

function RunningBackup({ backup, busy, onCancel }: { backup: BackupSummary; busy: boolean; onCancel: () => void }) {
  return (
    <div className="mt-4 rounded-lg border border-info/25 bg-info-soft p-3" role="status">
      <p className="text-13-5 font-semibold text-ink">
        {backup.type === "full" ? "Full" : "Incremental"} backup: {STEP[backup.status] ?? backup.status}…
      </p>
      <p className="mt-0.5 text-12-5 text-muted">
        {backup.status === "dumping" && backup.progress.dump_table ? `At the ${backup.progress.dump_table} table. ` : ""}
        {backup.status === "archiving" ? `${backup.progress.archived} of ${backup.file_count} files packed. ` : ""}
        Started {relativeTime(backup.started_at ?? backup.created_at)}.
      </p>
      {backup.status === "uploading" && (
        <ul className="mt-2 grid gap-1.5">
          {backup.destinations.map((d) => (
            <li key={d.key} className="text-12-5 text-ink-2">
              <span className="font-semibold">{d.label}</span>: {d.status === "failed" ? `failed — ${d.error}` : `${formatBytes(d.bytes_sent)} of ${formatBytes(d.bytes)}`}
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-card">
                <span className="block h-full origin-left bg-info" style={{ scale: `${d.bytes ? Math.min(1, d.bytes_sent / d.bytes) : 0} 1` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" disabled={busy} onClick={onCancel} className="mt-2 text-13 font-semibold text-err hover:underline">Cancel this backup</button>
    </div>
  );
}

function RestorePanel({ restore, onChange }: { restore: BackupRestoreSummary; onChange: () => Promise<void> }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The clock read once, when the screen mounted — a render must not read it.
  const [mountedAt] = useState(() => Date.now());
  const active = RESTORING.includes(restore.status);
  const recent = restore.finished_at && mountedAt - new Date(restore.finished_at).getTime() < 24 * 60 * 60 * 1000;

  if (!active && !recent) return null;

  const p = restore.progress;

  return (
    <section>
      {restore.status === "completed" ? (
        <Alert tone="ok" title={`Restored from ${restore.folder}`} dismissible={false}>
          {restore.scope === "files" ? "The files" : restore.scope === "database" ? "The database" : "The database and the files"} are as they were then
          {p.files_written ? ` (${p.files_written} files put back${p.files_removed ? `, ${p.files_removed} removed` : ""})` : ""}.
          {p.migrated ? " The database was then brought up to this version’s schema." : ""}
          {restore.safety_folder ? ` If this was the wrong backup, restore the safety copy ${restore.safety_folder}.` : ""}
        </Alert>
      ) : restore.status === "failed" ? (
        <Alert tone="err" title="The restore did not complete" dismissible={false}>{restore.error}</Alert>
      ) : restore.status === "cancelled" ? (
        <Alert tone="info" title="The restore was cancelled" dismissible={false}>Nothing was replaced.</Alert>
      ) : (
        <div className="rounded-lg border border-warn/25 bg-warn-soft p-3" role="status">
          <p className="text-13-5 font-semibold text-ink">Restoring {restore.folder}: {RESTORE_STEP[restore.status] ?? restore.status}…</p>
          <p className="mt-0.5 text-12-5 text-muted">
            {restore.status === "downloading" && p.current ? `${p.current.file}: ${formatBytes(p.current.bytes)} of ${formatBytes(p.current.size)}. ` : ""}
            {restore.status === "importing" && p.sql_percent !== null ? `${p.sql_percent}% of the dump, ${p.statements} statements. ` : ""}
            {restore.status === "files" ? `${p.files_written} files put back. ` : ""}
            Started by {restore.created_by ?? "someone"} {relativeTime(restore.started_at ?? restore.created_at)}.
          </p>
          {error && <p className="mt-1 text-12-5 text-err">{error}</p>}
          {["pending", "safety", "downloading"].includes(restore.status) && (
            <button
              type="button" disabled={busy}
              onClick={() => start(async () => {
                const result = await cancelRestoreAction(restore.id);
                setError(result.error ?? null);
                await onChange();
              })}
              className="mt-2 text-13 font-semibold text-err hover:underline"
            >
              Cancel — nothing has been replaced yet
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function BackupTable({
  backups, busy, onRestore, onDelete,
}: {
  backups: BackupSummary[];
  busy: boolean;
  onRestore: (backup: BackupSummary) => void;
  onDelete: (backup: BackupSummary) => void;
}) {
  const builtOn = new Set(backups.flatMap((b) => [b.parent_id, b.base_id]).filter(Boolean));

  return (
    <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
      <table className="admin-table w-full min-w-[820px] text-left text-13">
        <thead>
          <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
            <th scope="col" className="px-3 py-1.5">Made</th>
            <th scope="col" className="px-3 py-1.5">Kind</th>
            <th scope="col" className="px-3 py-1.5">Holds</th>
            <th scope="col" className="px-3 py-1.5">Where</th>
            <th scope="col" className="px-3 py-1.5">Status</th>
            <th scope="col" className="px-3 py-1.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {backups.map((b) => {
            const status = STATUS[b.status] ?? { label: STEP[b.status] ?? b.status, tone: "open" as const };
            const done = b.status === "completed" || b.status === "completed_with_errors";

            return (
              <tr key={b.id} className="border-b border-line last:border-b-0 align-top">
                <td data-label="Made" className="px-3 py-2">
                  <span className="text-13-5 font-medium text-ink">{formatDate(b.created_at, "dateTime")}</span>
                  <p className="mt-0.5 text-12 text-muted">
                    {b.trigger === "schedule" ? "Scheduled" : b.trigger === "pre_restore" ? "Safety copy before a restore" : `By ${b.created_by ?? "hand"}`}
                  </p>
                  <p className="mt-0.5 font-mono text-11-5 text-faint">{b.folder}</p>
                </td>
                <td data-label="Kind" className="px-3 py-2">
                  <Badge tone={b.type === "full" ? "brand" : "closed"} dot={false}>{b.type === "full" ? "Full" : "Incremental"}</Badge>
                </td>
                <td data-label="Holds" className="px-3 py-2 text-12-5 text-ink-2">
                  <span className="block">{formatBytes(b.total_bytes)}</span>
                  <span className="block text-muted">
                    {[b.includes.database && "database", (b.includes.public || b.includes.private) && `${b.file_count} ${b.type === "full" ? "files" : "changed files"}`].filter(Boolean).join(" + ") || "—"}
                    {b.deleted_count ? `, ${b.deleted_count} deleted` : ""}
                  </span>
                </td>
                <td data-label="Where" className="px-3 py-2">
                  <ul className="flex flex-wrap gap-1">
                    {b.destinations.map((d) => (
                      <li key={d.key} title={d.error ?? undefined}>
                        <Badge tone={d.status === "done" ? "resolved" : d.status === "failed" ? "urgent" : "open"}>{d.label}</Badge>
                      </li>
                    ))}
                    {b.local && <li><Badge tone="closed">This server</Badge></li>}
                    {b.destinations.length === 0 && !b.local && <li className="text-12-5 text-faint">—</li>}
                  </ul>
                </td>
                <td data-label="Status" className="px-3 py-2">
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {b.error && b.status !== "cancelled" && <p className="mt-1 max-w-[36ch] text-12 text-muted">{b.error}</p>}
                </td>
                <td data-label="Actions" className="px-3 py-2 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {done && b.restorable_from.length > 0 && (
                      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onRestore(b)}>Restore…</Button>
                    )}
                    {!RUNNING.includes(b.status) && !builtOn.has(b.id) && (
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(b)}>Delete</Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FindOnDestination({
  destinations, disabled, onRestore,
}: {
  destinations: BackupIndex["meta"]["destinations"];
  disabled: boolean;
  onRestore: (destination: string, folder: RemoteBackupFolder) => void;
}) {
  const usable = destinations.filter((d) => d.configured);
  const [key, setKey] = useState<string>(usable[0]?.key ?? "");
  const [folders, setFolders] = useState<RemoteBackupFolder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  if (usable.length === 0) return null;

  return (
    <Card interactive={false} padding="md" as="section">
      <h2 className="text-15 font-semibold text-ink">Find backups on a destination</h2>
      <p className="measure mt-1 text-13 text-muted">
        On a new server this list above is empty — the database that remembered it is what is being restored. The
        destination still has every backup, each described by its own manifest.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="Destination" htmlFor="find-destination" variant="float-static" className="mb-0">
          <Select id="find-destination" value={key} onChange={(e) => setKey(e.currentTarget.value)}>
            {usable.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </Select>
        </Field>
        <Button
          type="button" size="sm" variant="secondary" disabled={busy || !key} pending={busy}
          onClick={() => start(async () => {
            const result = await destinationFoldersAction(key);
            setError(result.error ?? null);
            setFolders(result.folders ?? null);
          })}
        >
          Look
        </Button>
      </div>

      {error && <Alert tone="err" title="The destination did not answer">{error}</Alert>}

      {folders && (folders.length === 0 ? (
        <p className="mt-3 text-13 text-muted">No backups there.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line-strong">
          {folders.map((f) => (
            <li key={f.folder} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-13 font-medium text-ink">
                  {f.created_at ? formatDate(f.created_at, "dateTime") : f.folder}
                  {f.type && <Badge tone={f.type === "full" ? "brand" : "closed"} dot={false} className="ml-2">{f.type === "full" ? "Full" : "Incremental"}</Badge>}
                </span>
                <span className="block font-mono text-11-5 text-faint">{f.folder}</span>
                {!f.complete && <span className="block text-12 text-err">{f.error}</span>}
                {f.newer_schema && <span className="block text-12 text-warn">Made by a newer version of this application.</span>}
              </span>
              {f.complete && (
                <span className="text-12-5 text-muted">{formatBytes(f.total_bytes)}</span>
              )}
              {f.complete && !f.newer_schema && (
                <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => onRestore(key, f)}>Restore…</Button>
              )}
            </li>
          ))}
        </ul>
      ))}
    </Card>
  );
}

function RestoreDialog({ target, onClose, onStarted }: { target: Target; onClose: () => void; onStarted: () => Promise<void> }) {
  const includes = target.kind === "local" ? target.backup.includes : target.folder.includes ?? {};
  const hasDb = Boolean(includes.database);
  const hasFiles = Boolean(includes.public || includes.private);
  const sources = target.kind === "local" ? target.backup.restorable_from : [target.destination];

  const [scope, setScope] = useState<"both" | "database" | "files">(hasDb && hasFiles ? "both" : hasDb ? "database" : "files");
  const [from, setFrom] = useState(sources[0] ?? "local");
  const [prune, setPrune] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const when = target.kind === "local" ? target.backup.created_at : target.folder.created_at ?? null;
  const chain = target.kind === "local" ? (target.backup.type === "incremental" ? "an incremental: the full before it and every incremental between are applied too" : "a full backup")
    : target.folder.type === "incremental" ? `an incremental on top of ${target.folder.chain?.length ?? 0} earlier backup(s), all fetched and applied in order` : "a full backup";

  const submit = () => start(async () => {
    const result = await startRestoreAction({
      ...(target.kind === "local"
        ? { backup_id: target.backup.id, from }
        : { destination: target.destination, folder: target.folder.folder }),
      scope,
      prune_missing: prune && scope !== "database",
      confirm,
    });

    if (result.error) {
      setError(result.error);

      return;
    }

    await onStarted();
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Restore this backup"
      description={`${formatDate(when, "dateTime")} — ${chain}.`}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Keep things as they are</Button>
          <Button type="button" variant="destructive" size="sm" disabled={busy || confirm.trim() !== "RESTORE"} pending={busy} onClick={submit}>
            Replace the {scope === "both" ? "database and files" : scope === "database" ? "database" : "files"}
          </Button>
        </div>
      )}
    >
      <div className="grid gap-4 text-13">
        {error && <Alert tone="err" title="The restore was refused">{error}</Alert>}

        <fieldset>
          <legend className="mb-1.5 text-13 font-semibold text-ink">What to put back</legend>
          {([["both", "The database and the files", hasDb && hasFiles], ["database", "The database only", hasDb], ["files", "The files only", hasFiles]] as const).map(([value, label, ok]) => (
            <label key={value} className="flex items-center gap-2 py-1 text-13 text-ink-2">
              <input type="radio" name="scope" value={value} checked={scope === value} disabled={!ok} onChange={() => setScope(value)} className="size-4 accent-brand-600" />
              {label}
            </label>
          ))}
        </fieldset>

        {target.kind === "local" && sources.length > 1 && (
          <Field label="Read it from" htmlFor="restore-from" variant="float-static">
            <Select id="restore-from" value={from} onChange={(e) => setFrom(e.currentTarget.value)}>
              {sources.map((s) => <option key={s} value={s}>{LABELS[s] ?? s}</option>)}
            </Select>
          </Field>
        )}

        {scope !== "database" && (
          <label className="flex items-start gap-2 text-13 text-ink-2">
            <input type="checkbox" checked={prune} onChange={(e) => setPrune(e.currentTarget.checked)} className="mt-0.5 size-4 accent-brand-600" />
            <span>
              Also delete files that were not in the backup
              <span className="block text-12-5 text-muted">Off, files added since stay. On, the media library and attachments become exactly what the backup held.</span>
            </span>
          </label>
        )}

        <ul className="list-disc space-y-1 pl-5 text-12-5 text-muted">
          {scope !== "files" && <li>A safety copy of the current database is taken first, and can be restored the same way.</li>}
          {scope !== "files" && <li>Everything written since the backup — orders, tickets, sign-ups — goes. You will probably be signed out.</li>}
          <li>While it runs, the site answers “try again in a few minutes” to everything but this screen.</li>
        </ul>

        <Field label="Type RESTORE to confirm" htmlFor="restore-confirm">
          <Input id="restore-confirm" value={confirm} onChange={(e) => setConfirm(e.currentTarget.value)} autoComplete="off" spellCheck={false} />
        </Field>
      </div>
    </Modal>
  );
}
