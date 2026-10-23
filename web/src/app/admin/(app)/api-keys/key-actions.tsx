"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/input";
import { SecretOnce } from "@/components/admin/secret-once";
import { deleteApiKeyAction, revokeApiKeyAction, rollApiKeyAction } from "./actions";
import { CurlExample } from "./curl-example";

type Which = "roll" | "revoke" | "delete" | null;

/**
 * Roll, revoke and delete, each behind its own confirmation.
 *
 * Sits **outside** the edit form (a dialog's buttons inside a `<form>` would
 * submit it). Revoke and delete end in a redirect from the action; roll is the
 * one that stays, because the new key is on that response only and has to be
 * shown here — the old one has stopped working by the time it appears.
 */
export function KeyActions({
  id, name, revoked, baseUrl,
}: {
  id: number;
  name: string;
  revoked: boolean;
  baseUrl: string;
}) {
  const [open, setOpen] = useState<Which>(null);
  const [busy, start] = useTransition();
  const [rolled, setRolled] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => setOpen(null);

  function confirm(which: Exclude<Which, null>) {
    start(async () => {
      if (which === "roll") {
        const result = await rollApiKeyAction(id);
        setOpen(null);
        if (result.key) { setRolled(result.key); setError(null); } else setError(result.error ?? null);
        return;
      }
      if (which === "revoke") await revokeApiKeyAction(id);
      else await deleteApiKeyAction(id);
    });
  }

  return (
    <div className="mb-5">
      {error && <Alert tone="err" title="Could not roll the key">{error}</Alert>}
      {rolled && (
        <>
          <SecretOnce
            secret={rolled} name={name} label="new API key"
            lost="roll it again and update the system that uses it"
          />
          <CurlExample baseUrl={baseUrl} keyText={rolled} />
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {!revoked && <Button type="button" size="sm" variant="warn" onClick={() => setOpen("roll")}>Roll key</Button>}
        {!revoked && <Button type="button" size="sm" variant="secondary" onClick={() => setOpen("revoke")}>Revoke</Button>}
        <Button type="button" size="sm" variant="destructive" onClick={() => setOpen("delete")}>Delete</Button>
      </div>

      {!revoked && <>
      <Modal open={open === "roll"} onClose={close} title={`Roll “${name}”?`}>
        <p className="measure text-13 text-muted">
          A new key is made and shown once. <strong>The old key stops working at
          once</strong>, so whatever uses it fails until it is given the new one.
          The name, permissions and expiry stay as they are.
        </p>
        <Buttons busy={busy} label="Roll key" busyLabel="Rolling…" variant="warn" onConfirm={() => confirm("roll")} onCancel={close} />
      </Modal>

      <Modal open={open === "revoke"} onClose={close} title={`Revoke “${name}”?`}>
        <p className="measure text-13 text-muted">
          The key stops working at once and <strong>cannot be switched back on</strong>.
          Its request log is kept. To give the other system access again, make a new key.
        </p>
        <Buttons busy={busy} label="Revoke key" busyLabel="Revoking…" variant="destructive" onConfirm={() => confirm("revoke")} onCancel={close} />
      </Modal>

      </>}

      <Modal open={open === "delete"} onClose={close} title={`Delete “${name}”?`}>
        <p className="measure text-13 text-muted">
          The key stops working and its request log goes with it. This cannot be undone.
          Revoke it instead to keep the log.
        </p>
        <Buttons busy={busy} label="Delete key" busyLabel="Deleting…" variant="destructive" onConfirm={() => confirm("delete")} onCancel={close} />
      </Modal>
    </div>
  );
}

function Buttons({
  busy, label, busyLabel, variant, onConfirm, onCancel,
}: {
  busy: boolean;
  label: string;
  busyLabel: string;
  variant: "warn" | "destructive";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 flex gap-2">
      <Button type="button" variant={variant} pending={busy} onClick={onConfirm}>{busy ? busyLabel : label}</Button>
      <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Keep it</Button>
    </div>
  );
}
