"use client";

import { SettingSwitch } from "@/components/admin/setting-switch";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClearSecretButton } from "./clear-secret-button";
import { MailboxConnection } from "./mailbox-connection";
import {
  connectInboundMailboxAction, disconnectInboundMailboxAction, testInboundMailAction,
} from "./tickets-actions";
import type { MailActionState } from "./mail-actions";
import type { SettingGroups } from "@/lib/admin";
import type { InboundEmailRow, InboundMailStatus } from "@/types/api";
import { formatDate } from "@/lib/dates";

const initial: MailActionState = {};

/** Labels and hints for the fields the provider decides between. */
const FIELDS: Record<string, { label: string; hint?: string; placeholder?: string; secret?: boolean }> = {
  inbound_imap_host: { label: "IMAP host", placeholder: "imap.example.com" },
  inbound_imap_port: { label: "Port", placeholder: "993" },
  inbound_imap_encryption: { label: "Encryption" },
  inbound_imap_username: { label: "Username", placeholder: "support@example.com", hint: "Usually the full email address." },
  inbound_imap_password: { label: "Password", secret: true },
  inbound_oauth_client_id: {
    label: "Client ID",
    hint: "From the OAuth client (Google Cloud) or the app registration (Entra ID). The client used for Outgoing mail will do for Google, once this screen's callback address is added to it.",
  },
  inbound_oauth_client_secret: { label: "Client secret", secret: true },
  inbound_oauth_tenant: {
    label: "Tenant",
    placeholder: "common",
    hint: "The Entra ID tenant — a domain like contoso.onmicrosoft.com, or its ID. \"common\" accepts any Microsoft account the app is allowed.",
  },
};

/** The rows drawn after the connection, in this order. */
const AFTER = [
  "inbound_mail_address", "inbound_mail_folder", "inbound_mail_after", "inbound_mail_processed_folder",
  "inbound_mail_unknown_sender", "inbound_mail_category_id", "inbound_mail_priority",
] as const;

const AFTER_LABELS: Record<(typeof AFTER)[number], { label: string; hint?: string; placeholder?: string }> = {
  inbound_mail_address: {
    label: "The address customers write to",
    placeholder: "support@example.com",
    hint: "Blank means the login above. Replies to the acknowledgement are pointed here, so it must be the mailbox being read.",
  },
  inbound_mail_folder: { label: "Folder to read", placeholder: "INBOX" },
  inbound_mail_after: { label: "After a message is handled" },
  inbound_mail_processed_folder: {
    label: "Move it to",
    placeholder: "Processed",
    hint: "Created the first time it is needed. Only applies when messages are moved.",
  },
  inbound_mail_unknown_sender: { label: "An address with no portal account" },
  inbound_mail_category_id: { label: "Category for emailed tickets" },
  inbound_mail_priority: { label: "Priority for emailed tickets" },
};

/**
 * Email to ticket: which mailbox, how it is reached, and what becomes of
 * what arrives.
 *
 * Its own panel for the reason Outgoing mail has one: which fields exist
 * depends on the provider chosen, and it carries three buttons that save
 * nothing. Every provider's fields are rendered once and stay mounted —
 * hidden, never unmounted — so switching provider does not wipe the
 * credentials of the one switched away from, and no two inputs share a
 * name inside the one settings form (the `mail_api_key` lesson).
 *
 * The switch is a real checkbox whose value is posted by a hidden input,
 * the announcement panel's idiom: an unticked checkbox posts nothing, and a
 * setting that is not posted is a setting left alone rather than switched
 * off.
 */
export function TicketsPanel({ status, rows }: { status: InboundMailStatus; rows: SettingGroups[string] }) {
  const row = (key: string) => rows.find((r: SettingGroups[string][number]) => r.key === key);

  const [chosen, setChosen] = useState(status.provider ?? "");
  const [enabled, setEnabled] = useState(row("inbound_mail_enabled")?.value === "1");
  const [after, setAfter] = useState(row("inbound_mail_after")?.value ?? "move");

  // A transition and a click, not a nested <form action> — this panel sits
  // inside the settings form, and HTML forbids one form inside another.
  const [busy, start] = useTransition();
  const [result, setResult] = useState<MailActionState>(initial);
  const run = (action: () => Promise<MailActionState>) =>
    start(async () => setResult(await action()));

  const option = status.providers.find((p) => p.value === chosen);
  const fields = status.providers.flatMap((p) => p.fields).filter((key, i, all) => all.indexOf(key) === i);
  const inUse = new Set(option?.fields ?? []);

  const lastRun = status.last_run_at ? formatDate(status.last_run_at, "long") : null;
  const missingPhp = Object.entries(status.php).filter(([, ok]) => !ok).map(([name]) => name);
  const schedulerStopped = status.scheduler.known && status.scheduler.running === false;

  return (
    <div className="grid gap-4">
      {status.error && (
        <Alert tone="err" title="The mailbox could not be read">
          {status.error}
          <span className="mt-1 block">
            Nothing is lost: the messages stay where they are and are picked up
            once this is fixed. Check the connection below to clear this.
          </span>
        </Alert>
      )}

      {enabled && status.enabled && schedulerStopped && (
        <Alert tone="warn" title="The scheduler is not running, so the mailbox is not being read">
          Piping runs once a minute from the scheduled task, and nothing throws when
          it stops — messages simply wait.{" "}
          <Link href="/admin/system/status#scheduler" className="font-semibold underline">System → Status</Link> shows the exact line it needs on this server.
        </Alert>
      )}

      {result.error && <Alert tone="err" title="That did not work">{result.error}</Alert>}
      {result.ok && <Alert tone="ok" title="Done">{result.ok}</Alert>}

      <SettingSwitch
        id="inbound-mail-enabled"
        name="setting__inbound_mail_enabled"
        checked={enabled}
        onChange={setEnabled}
        align="start"
        note={<>
          Every new message in the mailbox below becomes a ticket, the sender gets the
          acknowledgement with the reference, and the desk is told — exactly as for a
          ticket raised in the portal. A reply that quotes the reference lands on the
          ticket.{" "}
          {lastRun ? `Last read ${lastRun}.` : "Not read yet."}
        </>}
      >
        Open tickets from email
      </SettingSwitch>

      <Field
        label="How the mailbox is reached" htmlFor="setting__inbound_mail_provider"
        hint={option?.blurb ?? "Choose one, save, then fill in what it asks for."}
        variant="float-static"
      >
        <Select
          id="setting__inbound_mail_provider" name="setting__inbound_mail_provider"
          value={chosen} onChange={(e) => setChosen(e.target.value)}
        >
          <option value="">Not set</option>
          {status.providers.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </Select>
      </Field>

      {/*
        Every provider reads the mailbox over IMAP through a PHP library that
        declares ext-zip, so the moment one is chosen the panel says whether
        this server has it — before a password is saved, not at the first
        connection — and reminds whoever deploys that the server they deploy
        to needs the same box ticked. Inline rather than a toast: it is
        standing information about the server, not something that happened.
      */}
      {chosen !== "" && (missingPhp.length > 0 ? (
        <Alert tone="warn" title={`PHP is missing ${missingPhp.length === 1 ? "an extension" : "extensions"} the mailbox reader needs`} dismissible={false}>
          The IMAP library needs {missingPhp.map((n) => `ext-${n}`).join(", ")}, which this server does not
          have enabled. Enable {missingPhp.length === 1 ? "it" : "them"} in php.ini
          (<span className="font-mono text-12">extension={missingPhp[0]}</span>) and restart PHP, or the
          first connection will fail.
        </Alert>
      ) : (
        <Alert tone="info" title="PHP is ready on this server" dismissible={false}>
          The IMAP library needs PHP&apos;s <span className="font-mono text-12">zip</span> extension
          (it had to be enabled in php.ini here), and this server has it. Tick the same box for
          the PHP the site is deployed under — Plesk&apos;s PHP settings — before switching this on there.
        </Alert>
      ))}

      {/* Hidden whole while no provider is chosen, or the empty grid leaves
          a gap between the select and the rule below it. */}
      <div className="grid gap-x-4 sm:grid-cols-2" hidden={inUse.size === 0}>
        {fields.map((key) => {
          const meta = FIELDS[key];
          const data = row(key);
          if (!meta || !data) return null;

          return (
            <div key={key} hidden={!inUse.has(key)}>
              <Field
                label={meta.label} htmlFor={`setting__${key}`}
                variant={data.options?.length ? "float-static" : undefined}
                hint={[
                  meta.hint,
                  meta.secret && data.is_set
                    ? "Saved — leave blank to keep it, or type a new one to replace it."
                    : null,
                ].filter(Boolean).join(" ") || undefined}
              >
                {data.options?.length ? (
                  <Select id={`setting__${key}`} name={`setting__${key}`} defaultValue={data.value ?? ""}>
                    {data.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id={`setting__${key}`} name={`setting__${key}`}
                    type={meta.secret ? "password" : "text"}
                    defaultValue={meta.secret ? "" : (data.value ?? "")}
                    placeholder={meta.placeholder}
                    autoComplete="off"
                  />
                )}
              </Field>
              {meta.secret && data.is_set && <ClearSecretButton settingKey={key} label={meta.label} />}
            </div>
          );
        })}
      </div>

      {option?.is_oauth && (
        <MailboxConnection
          account={status.account}
          connectedAt={status.connected_at}
          isConnected={status.is_connected}
          providerLabel={option.value === "microsoft" ? "Microsoft" : "Google"}
          busy={busy}
          onConnect={() => run(() => connectInboundMailboxAction(option.value))}
          onDisconnect={() => run(disconnectInboundMailboxAction)}
          connectLabel={option.value === "microsoft" ? "Connect a Microsoft 365 mailbox" : "Connect a Google mailbox"}
          disconnectWarning="Email piping stops until a mailbox is connected again."
          hint={`Save the client ID and secret first — the connection is started with them. Register ${status.callback_path} on this site's address as the redirect URI. ${
            option.value === "microsoft"
              ? "The app registration needs the delegated permissions IMAP.AccessAsUser.All, offline_access, openid and email, and IMAP must be switched on for the mailbox."
              : "A consent screen still in \"Testing\" expires the connection after seven days; publish it, or use an internal Workspace app."
          }`}
        />
      )}

      <div className="grid gap-x-4 border-t border-line pt-4 sm:grid-cols-2">
        {AFTER.map((key) => {
          const data = row(key);
          if (!data) return null;
          const meta = AFTER_LABELS[key];
          const id = `setting__${key}`;

          if (key === "inbound_mail_category_id") {
            return (
              <Field key={key} label={meta.label} htmlFor={id} variant="float-static" hint="Or none, and the desk files it.">
                <Select id={id} name={id} defaultValue={data.value ?? ""}>
                  <option value="">None</option>
                  {status.categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </Select>
              </Field>
            );
          }

          if (data.options?.length) {
            const value = key === "inbound_mail_after" ? after : undefined;
            const description = data.options.find((o) => o.value === (value ?? data.value ?? data.options?.[0]?.value))?.description;

            return (
              <Field key={key} label={meta.label} htmlFor={id} variant="float-static" hint={description}>
                <Select
                  id={id} name={id}
                  {...(key === "inbound_mail_after"
                    ? { value: after, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setAfter(e.target.value) }
                    : { defaultValue: data.value ?? "" })}
                >
                  {data.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
            );
          }

          return (
            <div key={key} hidden={key === "inbound_mail_processed_folder" && after !== "move"}>
              <Field label={meta.label} htmlFor={id} hint={meta.hint}>
                <Input id={id} name={id} defaultValue={data.value ?? ""} placeholder={meta.placeholder} autoComplete="off" />
              </Field>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* `type="button"`, or it submits the settings form it is standing in. */}
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => run(testInboundMailAction)}>
            {busy ? "Working…" : "Check the connection"}
          </Button>
          <p className="measure text-12-5 text-muted">
            Connects with what is <em>saved</em>, selects the folder and counts what is
            unread. It reads only — nothing is flagged, moved or turned into a ticket.
          </p>
        </div>
      </div>

      <RecentEmails rows={status.recent} />
    </div>
  );
}

/** The last ten messages the mailbox handed over, and what became of each. */
function RecentEmails({ rows }: { rows: InboundEmailRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="border-t border-line pt-4 text-12-5 text-muted">
        Nothing has been read from the mailbox yet. Once something has, the last ten
        messages and what became of each appear here.
      </p>
    );
  }

  return (
    <div className="border-t border-line pt-4">
      <h3 className="mb-2 text-13-5 font-semibold text-ink">Recently read</h3>
      <ul className="divide-y divide-line rounded-lg border border-line-strong bg-card">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2 text-12-5">
            <span className="w-full truncate text-ink sm:w-auto sm:max-w-[36ch]" title={r.subject ?? ""}>
              {r.subject || "(No subject)"}
            </span>
            <span className="truncate text-muted sm:max-w-[28ch]" title={r.from}>{r.from_name ? `${r.from_name} <${r.from}>` : r.from}</span>
            <span className="ml-auto flex items-center gap-2">
              <Outcome outcome={r.outcome} reason={r.reason} />
              {r.ticket_reference && (
                <Link href={`/admin/tickets/${r.ticket_reference}`} className="font-mono text-12 text-brand-ink hover:underline">
                  {r.ticket_reference}
                </Link>
              )}
              {r.created_at && <span className="text-faint">{formatDate(r.created_at, "short")}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Outcome({ outcome, reason }: { outcome: string; reason: string | null }) {
  const [kind, detail] = outcome.split(":", 2);
  const tone = kind === "ticket_created" ? "resolved" : kind === "reply_added" ? "open" : kind === "failed" ? "urgent" : "closed";
  const label = kind === "ticket_created" ? "Ticket opened"
    : kind === "reply_added" ? "Reply added"
    : kind === "failed" ? "Failed"
    : kind === "processing" ? "Working"
    : `Skipped — ${(detail ?? "").replace(/_/g, " ")}`;

  return <Badge tone={tone} className={reason ? "cursor-help" : undefined}><span title={reason ?? undefined}>{label}</span></Badge>;
}
