"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/dates";
import type { UpdatePackage, UpdateRun, UpdateStatus, UpdatesIndex } from "@/types/system";
import {
  abandonUpdateAction, applyUpdateAction, deletePackageAction, loadUpdatesAction, retryUpdateAction,
  rollbackUpdateAction, stepUpdateAction,
} from "./actions";

/** The steps a person is shown, in order, for an update and for a rollback. */
const FORWARD: [UpdateStatus[], string][] = [
  [["preflight"], "Checking the file"],
  [["backup"], "Safety copy of the database"],
  [["extract"], "Unpacking"],
  [["swap", "swapping"], "Putting the new API in place"],
  [["migrate", "seed", "steps"], "Updating the database"],
  [["optimize"], "Finishing the API"],
  [["web"], "Restarting the website"],
  [["warm"], "Refreshing the pages"],
];

const BACKWARD: [UpdateStatus[], string][] = [
  [["rb_swap", "rb_swapping"], "Putting the previous version back"],
  [["rb_database"], "Restoring the database"],
  [["rb_optimize"], "Finishing the API"],
  [["rb_web"], "Restarting the website"],
  [["rb_warm"], "Refreshing the pages"],
];

const MOVING = new Set<string>([...FORWARD, ...BACKWARD].flatMap(([s]) => s));

function mb(bytes: number | null | undefined): string {
  return bytes ? `${(bytes / 1048576).toFixed(1)} MB` : "—";
}

export function UpdatesScreen({ initial }: { initial: UpdatesIndex }) {
  const [index, setIndex] = useState(initial);
  const [run, setRun] = useState<UpdateRun | null>(initial.run);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<UpdatePackage | null>(null);
  const [confirmRollback, setConfirmRollback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<{ name: string; done: number; total: number } | null>(null);
  const driving = useRef(false);
  // The run's key: steps go with it, since a rollback's restore drops the
  // sign-in tables while these steps are what drive it (lib/admin/system.ts).
  const key = useRef<string | undefined>(initial.run?.key);

  const refresh = useCallback(async () => {
    const res = await loadUpdatesAction();
    if (res.data) {
      setIndex(res.data);
      setRun(res.data.run);
    }
  }, []);

  /*
    The loop that is the update. Each step is one short request; the server
    keeps the state, so a closed tab carries on from where it was the next
    time this screen opens. A step that does not answer is tried again a few
    times before it is reported — the request that swaps the folders may be
    cut off by the host restarting PHP, and that is not a failed update.
  */
  const drive = useCallback(async () => {
    if (driving.current) return;
    driving.current = true;
    let misses = 0;

    try {
      for (;;) {
        const res = await stepUpdateAction(key.current);

        if (res.error) {
          if (++misses > 10) { setError(res.error); break; }
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }

        misses = 0;
        const next = res.data ?? null;
        if (next?.key) key.current = next.key;
        setRun(next);

        if (!next || !MOVING.has(next.status)) break;

        const wait = next.status === "swapping" || next.status === "rb_swapping" ? 1500 : next.status === "web" || next.status === "rb_web" ? 3000 : 150;
        await new Promise((r) => setTimeout(r, wait));
      }
    } finally {
      driving.current = false;
      await refresh();
    }
  }, [refresh]);

  // A run left mid-way (a closed tab, a lost connection) carries on by itself.
  useEffect(() => {
    if (initial.run && MOVING.has(initial.run.status)) void drive();
  }, [initial.run, drive]);

  async function apply(pkg: UpdatePackage) {
    setConfirm(null);
    setError(null);
    setBusy(true);
    const res = await applyUpdateAction(pkg.file);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    key.current = res.data?.key;
    setRun(res.data ?? null);
    void drive();
  }

  async function retry() {
    setError(null);
    const res = await retryUpdateAction();
    if (res.error) { setError(res.error); return; }
    key.current = res.data?.key;
    setRun(res.data ?? null);
    void drive();
  }

  async function rollback() {
    setConfirmRollback(false);
    setError(null);
    const res = await rollbackUpdateAction();
    if (res.error) { setError(res.error); return; }
    key.current = res.data?.key;
    setRun(res.data ?? null);
    void drive();
  }

  async function abandon() {
    const res = await abandonUpdateAction();
    if (res.error) { setError(res.error); return; }
    await refresh();
  }

  async function remove(file: string) {
    const res = await deletePackageAction(file);
    if (res.error) { setError(res.error); return; }
    await refresh();
  }

  /*
    Upload in pieces the host will accept (`chunk_bytes`, from the API —
    cPanel's default upload limit is 2 MB and a release is a hundred), in
    order, each through the console's upload route.
  */
  async function uploadFile(file: File) {
    setError(null);
    if (!/\.zip$/i.test(file.name)) { setError("Choose the .zip file your supplier sent."); return; }

    const name = file.name.replace(/[^A-Za-z0-9._-]/g, "-");
    const size = index.chunk_bytes;
    const total = Math.max(1, Math.ceil(file.size / size));
    setUpload({ name, done: 0, total });

    for (let i = 0; i < total; i++) {
      const body = new FormData();
      body.set("name", name);
      body.set("index", String(i));
      body.set("total", String(total));
      body.set("chunk", file.slice(i * size, (i + 1) * size), "chunk");

      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        const res = await fetch("/api/admin/system/updates/upload", { method: "POST", body }).catch(() => null);
        ok = !!res && res.ok;
        if (!ok && res) {
          const payload = await res.json().catch(() => null) as { message?: string; errors?: Record<string, string[]> } | null;
          const message = payload?.errors ? Object.values(payload.errors)[0]?.[0] : payload?.message;
          if (res.status < 500) { setError(message || "The upload was refused."); setUpload(null); return; }
        }
      }

      if (!ok) { setError("The upload stopped. Check the connection and try again."); setUpload(null); return; }
      setUpload({ name, done: i + 1, total });
    }

    setUpload(null);
    await refresh();
  }

  if (!index.updatable) {
    return (
      <Alert tone="info" title="This copy is a development checkout" dismissible={false}>
        It was not installed from a release zip, so it is updated with git rather than from this screen.
        Version {index.installed.version}.
      </Alert>
    );
  }

  const moving = run !== null && MOVING.has(run.status);
  const failed = run?.status === "failed";
  const beforeSwap = failed && ["preflight", "backup", "extract"].includes(run?.failed_at ?? "");
  const steps = run && (run.status.startsWith("rb_") || run.failed_at?.startsWith("rb_")) ? BACKWARD : FORWARD;
  const at = run ? steps.findIndex(([s]) => s.includes((failed ? run.failed_at : run.status) as UpdateStatus)) : -1;

  return (
    <div className="grid gap-5">
      {error && <Alert tone="err" title="That did not work">{error}</Alert>}

      <Card interactive={false} padding="sm" as="section">
        <p className="text-13-5">
          Installed: <span className="font-mono font-semibold">{index.installed.version}</span>
          {index.installed.built_at && <span className="text-muted"> · built {formatDate(index.installed.built_at, "long")}</span>}
        </p>
      </Card>

      {run && (moving || failed) && (
        <Card interactive={false} padding="sm" as="section" className="grid gap-3">
          <h2 className="text-15 font-semibold">
            {steps === BACKWARD ? `Rolling back to ${run.from}` : `Updating ${run.from} → ${run.to}`}
          </h2>
          <ol className="grid gap-1.5 text-13-5">
            {steps.map(([, label], i) => (
              <li key={label} className={i < at ? "text-ok" : i === at ? (failed ? "font-semibold text-err" : "font-semibold") : "text-muted"}>
                {i < at ? "✓ " : i === at ? (failed ? "✗ " : "→ ") : "· "}{label}
                {i === at && run.status === "extract" && run.extract_total ? ` (${Math.round(((run.extract_next ?? 0) / run.extract_total) * 100)}%)` : ""}
                {i === at && (run.status === "web" || run.status === "rb_web") && run.web_waiting ? " — if this takes more than two minutes, restart the Node.js app in the hosting panel" : ""}
              </li>
            ))}
          </ol>
          {moving && <p className="text-13 text-muted">Keep this page open. The API is closed to everything else until the update finishes; the public site keeps showing its pages.</p>}
          {failed && (
            <>
              <Alert tone="err" title="The update stopped" dismissible={false}>
                {run.error}
                {beforeSwap ? " Nothing on the live site was changed, and it is open again." : " The site's API stays closed until you carry on or roll back."}
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={retry}>Try this step again</Button>
                {beforeSwap
                  ? <Button size="sm" variant="secondary" onClick={abandon}>Put this update aside</Button>
                  : <Button size="sm" variant="destructive" onClick={() => setConfirmRollback(true)}>Roll back</Button>}
              </div>
            </>
          )}
          <details className="text-13">
            <summary className="cursor-pointer text-muted">What happened so far</summary>
            <ul className="mt-2 grid gap-1 font-mono text-12">
              {run.log.map((l, i) => <li key={i}>{formatDate(l.at, "dateTimeShort")} {l.line}</li>)}
            </ul>
          </details>
        </Card>
      )}

      {run?.status === "done" && (
        <Alert tone="ok" title={`Updated to ${run.to}`}>The website has been restarted and its pages refreshed.</Alert>
      )}
      {run?.status === "rolled_back" && (
        <Alert tone="ok" title={`Back on ${run.from}`}>The previous version is running again.</Alert>
      )}

      <Card interactive={false} padding="sm" as="section" className="grid gap-3">
        <h2 className="text-15 font-semibold">Updates waiting</h2>
        {index.packages.length === 0 && <p className="text-13-5 text-muted">None yet. Upload the zip your supplier sent, or put it in {index.packages_dir}.</p>}
        <ul className="grid gap-3">
          {index.packages.map((p) => (
            <li key={p.file} className="rounded-md border border-line-strong p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-13-5 font-semibold">{p.version ?? p.file}</span>
                {p.signed ? <Badge tone="resolved">Signed by your supplier</Badge> : <Badge tone="urgent">Not signed</Badge>}
                {p.changes_database && <Badge tone="progress">Changes the database</Badge>}
                <span className="text-13 text-muted">{mb(p.size)}</span>
                <span className="ml-auto flex gap-2">
                  {!p.refusal && !moving && <Button size="sm" pending={busy} onClick={() => setConfirm(p)}>{p.same_version ? "Reinstall" : "Apply"}</Button>}
                  {!moving && <Button size="sm" variant="ghost" onClick={() => remove(p.file)}>Delete</Button>}
                </span>
              </div>
              {p.refusal && <p className="mt-2 text-13 text-err">{p.refusal}</p>}
              {(p.changelog ?? []).length > 0 && (
                <details className="mt-2 text-13">
                  <summary className="cursor-pointer text-muted">What is new ({p.changelog!.length} {p.changelog!.length === 1 ? "release" : "releases"})</summary>
                  <div className="mt-2 grid gap-3">
                    {p.changelog!.map((c) => (
                      <div key={c.version}>
                        <p className="font-semibold">{c.version} <span className="font-normal text-muted">· {c.date}</span></p>
                        <p className="whitespace-pre-line text-muted">{c.text}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line-strong px-3 py-2 text-13-5 font-semibold hover:bg-surface-2">
            Upload a release zip
            <input
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              disabled={upload !== null || moving}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadFile(f); }}
            />
          </label>
          {upload && (
            <span className="text-13 text-muted" role="status">
              Uploading {upload.name}: {Math.round((upload.done / upload.total) * 100)}%
            </span>
          )}
        </div>
      </Card>

      {index.rollback && !moving && (
        <Card interactive={false} padding="sm" as="section" className="grid gap-2">
          <h2 className="text-15 font-semibold">Go back to the previous version</h2>
          <p className="text-13-5 text-muted">
            Version {index.rollback.to ?? "before the last update"} is still on this server.
            {index.rollback.database
              ? " The last update changed the database, so rolling back also restores the safety copy taken just before it — anything written since then (orders, tickets, edits) is lost."
              : " The last update did not change the database, so nothing written since is lost."}
          </p>
          <div><Button size="sm" variant="secondary" onClick={() => setConfirmRollback(true)}>Roll back…</Button></div>
        </Card>
      )}

      {index.history.length > 0 && (
        <Card interactive={false} padding="sm" as="section">
          <h2 className="mb-3 text-15 font-semibold">History</h2>
          <ul className="grid gap-1.5 text-13-5">
            {index.history.map((h, i) => (
              <li key={i}>
                {h.kind === "rollback" ? "Rolled back" : "Updated"} {h.from} → {h.to}
                <span className="text-muted"> · {formatDate(h.finished_at, "long")}{h.by ? ` · ${h.by}` : ""}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={`Apply ${confirm?.version ?? ""}?`}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button onClick={() => confirm && apply(confirm)}>Apply the update</Button>
        </>}
      >
        <p className="text-13-5">
          A safety copy of the database is taken first. While the update runs — usually two to five minutes —
          the console and the shop&apos;s checkout are closed; the public pages keep showing. Keep this page open until it finishes.
        </p>
      </Modal>

      <Modal
        open={confirmRollback}
        onClose={() => setConfirmRollback(false)}
        title="Roll back?"
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmRollback(false)}>Cancel</Button>
          <Button variant="destructive" onClick={rollback}>Roll back</Button>
        </>}
      >
        <p className="text-13-5">
          The previous version of the software is put back.
          {index.rollback?.database || (run && !["preflight", "backup", "extract"].includes(run.failed_at ?? ""))
            ? " If the update changed the database, the safety copy taken before it is restored — anything written since is lost."
            : ""}
        </p>
      </Modal>
    </div>
  );
}
