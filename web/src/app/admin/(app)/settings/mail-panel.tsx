"use client";

import { useState, useTransition } from "react";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ClearSecretButton } from "./clear-secret-button";
import { connectMailboxAction, disconnectMailboxAction, testMailAction, type MailActionState } from "./mail-actions";
import { cn } from "@/lib/utils";
import type { SettingGroups } from "@/lib/admin";
import type { MailStatus } from "@/types/api";

const initial: MailActionState = {};

/** Labels and hints for every field any transport can ask for. */
const FIELDS: Record<string, {
  label: string;
  hint?: string;
  placeholder?: string;
  secret?: boolean;
  options?: Array<{ value: string; label: string }>;
}> = {
  smtp_host: { label: "Host", placeholder: "smtp.example.com" },
  smtp_port: { label: "Port", placeholder: "587" },
  smtp_username: { label: "Username" },
  smtp_password: { label: "Password", secret: true },
  smtp_encryption: {
    label: "Encryption",
    // A list, not a text box. The three values are the whole vocabulary, and
    // the provider reads an unrecognised one as "work it out from the port" —
    // so a typo here is not an error, it is a silent change of behaviour.
    options: [
      { value: "tls", label: "STARTTLS — usually port 587" },
      { value: "ssl", label: "SSL/TLS — usually port 465" },
      { value: "none", label: "None — unencrypted" },
    ],
  },
  oauth_client_id: {
    label: "Client ID",
    hint: "From the OAuth client you created in Google Cloud. Ends in .apps.googleusercontent.com.",
  },
  oauth_client_secret: { label: "Client secret", secret: true },
  mail_api_key: {
    label: "API key",
    secret: true,
    // One row, two providers. Switching between them means pasting the new
    // one's key over the old one — said here rather than discovered through a
    // 401 from a provider whose key was never entered.
    hint: "Brevo and Mailgun share this field, so switching between them means pasting the new provider's key.",
  },
  mailgun_domain: { label: "Sending domain", placeholder: "mg.technoware.in" },
  mailgun_endpoint: {
    label: "Region endpoint",
    hint: "api.mailgun.net for the US, api.eu.mailgun.net for the EU. The wrong one fails as an authentication error rather than as the region mistake it is.",
  },
  ses_key: { label: "Access key ID" },
  ses_secret: { label: "Secret access key", secret: true },
  ses_region: { label: "Region", placeholder: "ap-south-1" },
  mail_from_address: {
    label: "From address",
    placeholder: "support@technoware.in",
    hint: "Must be an address the transport above is allowed to send as, or the provider will refuse the message.",
  },
  mail_from_name: { label: "From name", placeholder: "Technoware Support" },
};

/** Used by every transport, so shown under all of them rather than in each. */
const SHARED = ["mail_from_address", "mail_from_name"];

/**
 * Outgoing mail: which transport, its credentials, and proof that it works.
 *
 * Its own panel rather than a row of fields in the generic settings renderer,
 * because a flat list is wrong here in a way it is not wrong anywhere else:
 * twelve mail fields with four relevant to the chosen transport is a form
 * where "have I filled this in" has no answer. The transport decides which
 * fields exist, and the API is what says so — `transports[].fields` — so the
 * two cannot drift.
 *
 * Every field stays **mounted**, hidden rather than unmounted, for the reason
 * this project has already shipped a bug over: an unmounted input leaves the
 * DOM, and a field that is not submitted reads to the API as a field left
 * blank. Switching transport must not wipe the credentials of the one you
 * switched away from.
 *
 * They are also rendered **once each**, not once per transport that uses them.
 * See the comment on the grid below — two transports share `mail_api_key`, and
 * a field rendered twice is two inputs with one `id` and one `name` inside a
 * single form.
 */
export function MailPanel({ status, rows }: { status: MailStatus; rows: SettingGroups[string] }) {
  const [chosen, setChosen] = useState(status.transport ?? "smtp");

  /*
   * A transition and a click, not a nested <form action>. This panel sits
   * inside the settings form, and HTML forbids one form inside another — the
   * browser drops the inner one, so a "Send a test" submit button would have
   * saved every setting on the screen instead.
   */
  const [busy, start] = useTransition();
  const [result, setResult] = useState<MailActionState>(initial);
  const run = (action: () => Promise<MailActionState>) =>
    start(async () => setResult(await action()));

  const option = status.transports.find((t) => t.value === chosen);
  const row = (key: string) => rows.find((r: SettingGroups[string][number]) => r.key === key);

  // Every field, in transport order, deduplicated — and the set the chosen
  // transport actually reads, which is what decides visibility.
  const fields = status.transports
    .flatMap((t) => t.fields)
    .filter((key, i, all) => all.indexOf(key) === i);
  const inUse = new Set(option?.fields ?? []);

  return (
    <div className="grid gap-4">
      {/*
        The banner this whole feature exists to make possible. `Notifier`
        swallows send failures on purpose — a committed ticket must still
        answer 201 when mail is down — which until now meant a broken
        configuration announced itself by a customer's receipt not arriving.
      */}
      {status.error && (
        <Alert tone="err" title="Mail is not being delivered">
          {status.error}
          <span className="mt-1 block">
            Nothing was lost: tickets and enquiries are still being recorded. Fix
            the configuration below and send a test to clear this.
          </span>
        </Alert>
      )}

      {result.error && <Alert tone="err" title="That did not work">{result.error}</Alert>}
      {result.ok && <Alert tone="ok" title="Done">{result.ok}</Alert>}

      <Field
        label="Send mail through" htmlFor="setting__mail_transport"
        hint={option?.blurb}
        // A select always shows its value, so its label can never rest on top
        // of an empty box — it has nowhere to rest. That is what the static
        // variant is for.
        variant="float-static"
      >
        <Select
          id="setting__mail_transport" name="setting__mail_transport"
          value={chosen} onChange={(e) => setChosen(e.target.value)}
        >
          {status.transports.map((t) => (
            <option key={t.value} value={t.value} disabled={!t.available}>
              {t.label}{t.available ? "" : " — not installed"}
            </option>
          ))}
        </Select>
      </Field>

      {/*
        Said before the choice is saved, not after the next ticket fails to
        send a receipt. Same rule the media library follows when it refuses to
        resize an SVG: the reason belongs where the decision is made.
      */}
      {option && !option.available && (
        <Alert tone="warn" title={`${option.label} is not installed on this server`}>
          Run this on the server, then reload this page:
          <code className="mt-1.5 block rounded bg-surface-2 px-2 py-1.5 font-mono text-[12.5px] text-ink">
            {option.install}
          </code>
        </Alert>
      )}

      {/*
        Every field any transport can ask for, each rendered exactly once and
        all of them mounted. The obvious shape — a panel per transport holding
        that transport's fields — renders `mail_api_key` twice, because Brevo
        and Mailgun both use it. Two inputs then share an `id` and a `name`
        inside one form: the label's `htmlFor` resolves to whichever comes
        first, so clicking "API key" on the Mailgun panel focuses Brevo's
        hidden one, and the browser submits both values for the same key.
        Today that survives only because a blank secret means "unchanged" and
        the empty twin is discarded — which is a rule from somewhere else
        holding this together, not a design.
      */}
      <div className="grid gap-x-4 sm:grid-cols-2">
        {fields.map((key) => {
          const meta = FIELDS[key];
          const data = row(key);
          if (!meta || !data) return null;

          return (
            /*
              The clear button is a *sibling* of the Field, never a child.
              Field floats its label with `peer-*`, which only reaches a
              following sibling of the control — wrapping the input in a div
              to sit the button beside it silently severs that, and every
              label drops back on top of its own placeholder.
            */
            <div key={key} hidden={!inUse.has(key)}>
              <Field
                label={meta.label} htmlFor={`setting__${key}`}
                // A select always shows a value, so its label has nothing to
                // rest on top of and must not float down over it.
                variant={meta.options ? "float-static" : undefined}
                // Additive, not either/or: a field's own hint explains what
                // the value is, and the saved note explains what a blank
                // submit does. Losing the first once a value exists is losing
                // it exactly when somebody is changing that value.
                hint={[
                  meta.hint,
                  meta.secret && data.is_set
                    ? "Saved — leave blank to keep it, or type a new one to replace it."
                    : null,
                ].filter(Boolean).join(" ") || undefined}
              >
                {meta.options ? (
                  <Select
                    id={`setting__${key}`} name={`setting__${key}`}
                    defaultValue={data.value ?? ""}
                  >
                    {meta.options.map((o) => (
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

      {option?.is_oauth && <Mailbox status={status} busy={busy} run={run} />}

      {/*
        Every transport sends *from* somewhere, so this pair sits outside the
        per-transport panels — and inside this component rather than after it,
        or the generic renderer would put it below the test button and the
        screen would read "prove it works" before "say who it is from".
      */}
      <div className="grid gap-x-4 border-t border-line pt-4 sm:grid-cols-2">
        {SHARED.map((key) => {
          const data = row(key);
          if (!data) return null;

          return (
            <Field
              key={key} label={FIELDS[key].label} htmlFor={`setting__${key}`}
              hint={FIELDS[key].hint}
            >
              <Input
                id={`setting__${key}`} name={`setting__${key}`}
                defaultValue={data.value ?? ""} placeholder={FIELDS[key].placeholder}
              />
            </Field>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        {/* `type="button"`, or it submits the settings form it is standing in. */}
        <Button
          type="button" variant="secondary" size="sm" disabled={busy}
          onClick={() => run(testMailAction)}
        >
          {busy ? "Working…" : "Send a test message"}
        </Button>
        <p className="text-[12.5px] text-muted">
          Goes to your own address, using whatever is <em>saved</em> — so save first.
        </p>
      </div>
    </div>
  );
}

/** The connected mailbox, or the button that connects one. */
function Mailbox({
  status, busy, run,
}: {
  status: MailStatus;
  busy: boolean;
  run: (action: () => Promise<MailActionState>) => void;
}) {
  return (
    <div className={cn(
      "rounded-lg border p-4",
      status.is_connected ? "border-ok/25 bg-ok-soft" : "border-line-strong bg-surface-2",
    )}>
      {status.is_connected ? (
        <>
          <p className="text-[13.5px] font-semibold text-ink">
            Connected to {status.account}
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {status.connected_at
              ? `Authorised ${new Date(status.connected_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`
              : "Authorised."}{" "}
            Google will ask again if the account password changes or access is revoked.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Disconnect ${status.account}? Mail stops sending until another transport is configured.`)) return;
              run(disconnectMailboxAction);
            }}
            className="mt-2.5 text-[13px] font-semibold text-err hover:underline"
          >
            {busy ? "Working…" : "Disconnect"}
          </button>
        </>
      ) : (
        <>
          <p className="text-[13.5px] font-semibold text-ink">No mailbox connected</p>
          <p className="measure mt-0.5 text-[12.5px] text-muted">
            Save the client ID and secret first — the connection is started with
            them. Google will ask you to sign in and approve access, then send
            you back here.
          </p>
          <Button
            type="button" size="sm" className="mt-2.5" disabled={busy}
            onClick={() => run(() => connectMailboxAction("google"))}
          >
            {busy ? "Opening Google…" : "Connect a Google mailbox"}
          </Button>
        </>
      )}
    </div>
  );
}
