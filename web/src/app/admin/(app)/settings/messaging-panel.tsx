"use client";

import { useState, useTransition } from "react";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ClearSecretButton } from "./clear-secret-button";
import { testMessagingAction } from "./messaging-actions";
import type { MailActionState } from "./mail-actions";
import type { SettingGroups } from "@/lib/admin";
import type { MessagingChannelStatus, MessagingStatus } from "@/types/api";

/**
 * Labels for every field any messaging provider reads. Which of them a
 * provider reads is the API's (`providers[].fields`); only the words are here.
 */
const FIELDS: Record<string, { label: string; hint?: string; placeholder?: string; long?: boolean }> = {
  whatsapp_meta_phone_number_id: { label: "Phone number ID", hint: "WhatsApp → API Setup in the Meta app. The number the messages come from." },
  whatsapp_meta_business_account_id: { label: "WhatsApp Business account ID", hint: "On the same page. Templates live on the account — needed to submit and sync them." },
  whatsapp_meta_access_token: { label: "Access token", hint: "A system user's permanent token with whatsapp_business_messaging and whatsapp_business_management. The 24-hour token on the setup page stops working tomorrow." },
  whatsapp_meta_app_secret: { label: "App secret", hint: "App settings → Basic. Meta signs every webhook with it; without it, delivery reports and STOP replies are ignored." },
  whatsapp_meta_verify_token: { label: "Webhook verify token", hint: "Any phrase you choose, typed here and in Meta's webhook form. Meta sends it back once to prove the URL is yours." },
  whatsapp_gupshup_api_key: { label: "API key" },
  whatsapp_gupshup_app_name: { label: "App name", placeholder: "technoware" },
  whatsapp_gupshup_app_id: { label: "App ID", hint: "Needed to submit and sync templates." },
  whatsapp_gupshup_source: { label: "Sender number", placeholder: "919876543210" },
  whatsapp_twilio_account_sid: { label: "Account SID", placeholder: "AC…" },
  whatsapp_twilio_auth_token: { label: "Auth token", hint: "Twilio also signs its webhooks with it." },
  whatsapp_twilio_from: { label: "WhatsApp sender", placeholder: "+14155238886" },
  rcs_rbm_agent_id: { label: "Agent ID", placeholder: "technoware_agent" },
  rcs_rbm_service_account: { label: "Service account key (JSON)", hint: "Paste the whole key file of a service account with the RBM API enabled." },
  rcs_rbm_client_token: { label: "Webhook client token", hint: "The token set on the agent's webhook. Google signs every callback with it." },
  rcs_gupshup_userid: { label: "Enterprise user ID" },
  rcs_gupshup_password: { label: "Enterprise password" },
  rcs_gupshup_bot_id: { label: "Bot ID" },
  push_fcm_service_account: { label: "Service account key (JSON)", hint: "Firebase → Project settings → Service accounts → Generate new private key. Paste the whole file." },
};

/** Rendered once, below the channels: two Gupshup providers read it. */
const SHARED_SECRET = "messaging_webhook_secret";

/**
 * Messaging → Settings: per channel, which provider carries it, that
 * provider's credentials, the webhook URL to paste into it, and a test send;
 * then the quiet-hours window.
 *
 * Every field stays mounted and is hidden when the chosen provider does not
 * read it — the mail panel's rule, for the mail panel's reason: an unmounted
 * input is not submitted, and switching provider must not wipe the
 * credentials of the one switched away from.
 */
export function MessagingPanel({ status, rows }: { status: MessagingStatus; rows: SettingGroups[string] }) {
  const row = (key: string) => rows.find((r) => r.key === key);
  const secret = row(SHARED_SECRET);
  const start = row("messaging_promo_start");
  const end = row("messaging_promo_end");

  return (
    <div className="grid gap-6">
      {status.channels.map((channel) => (
        <ChannelSection key={channel.value} channel={channel} row={row} />
      ))}

      {secret && (
        <div className="border-t border-line pt-4">
          <h2 className="mb-2 text-15 font-semibold text-ink">Webhook secret</h2>
          <p className="measure mb-3 text-12-5 text-muted">
            Gupshup signs nothing, so its webhooks carry this on the callback URL as{" "}
            <code className="font-mono">?token=…</code>. Without it every Gupshup callback — delivery
            reports and STOP replies — is ignored, because a forged STOP would opt people out in silence.
          </p>
          <div className="max-w-md">
            <Field label="Shared secret" htmlFor={`setting__${SHARED_SECRET}`}
              hint={secret.is_set ? "Saved — leave blank to keep it, or type a new one to replace it." : "A long random string."}>
              <Input id={`setting__${SHARED_SECRET}`} name={`setting__${SHARED_SECRET}`} type="password" autoComplete="new-password"
                placeholder={secret.is_set ? "••••••••  (saved)" : undefined} />
            </Field>
            {secret.is_set && <ClearSecretButton settingKey={SHARED_SECRET} label="Shared secret" />}
          </div>
        </div>
      )}

      {start && end && (
        <div className="border-t border-line pt-4">
          <h2 className="mb-2 text-15 font-semibold text-ink">Quiet hours</h2>
          <p className="measure mb-3 text-12-5 text-muted">
            Basket reminders, wishlist notes and broadcasts go out only between these two times ({status.quiet_hours.timezone});
            anything that falls due outside waits for the window to open, on every channel and by email.
            Order and ticket updates go at any hour. The window is {status.quiet_hours.open_now ? "open now" : "closed now"}.
          </p>
          <div className="grid max-w-md gap-x-4 sm:grid-cols-2">
            <Field label="Opens at" htmlFor="setting__messaging_promo_start" variant="float-static">
              <Input id="setting__messaging_promo_start" name="setting__messaging_promo_start" type="time" defaultValue={start.value ?? "09:00"} />
            </Field>
            <Field label="Closes at" htmlFor="setting__messaging_promo_end" variant="float-static">
              <Input id="setting__messaging_promo_end" name="setting__messaging_promo_end" type="time" defaultValue={end.value ?? "21:00"} />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelSection({
  channel, row,
}: {
  channel: MessagingChannelStatus;
  row: (key: string) => SettingGroups[string][number] | undefined;
}) {
  const [chosen, setChosen] = useState(channel.provider ?? "");
  const [busy, start] = useTransition();
  const [result, setResult] = useState<MailActionState>({});
  const [to, setTo] = useState("");
  const option = channel.providers.find((p) => p.value === chosen);

  const fields = channel.providers.flatMap((p) => p.fields)
    .filter((key, i, all) => all.indexOf(key) === i && key !== SHARED_SECRET);
  const inUse = new Set(option?.fields ?? []);
  const test = () => start(async () => setResult(await testMessagingAction(channel.value, to)));
  const selectId = `setting__${channel.setting}`;

  return (
    <section className="border-t border-line pt-4 first:border-t-0 first:pt-0" aria-labelledby={`${channel.value}-heading`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id={`${channel.value}-heading`} className="text-15 font-semibold text-ink">{channel.label}</h2>
        <span className={channel.ready ? "text-12 font-semibold text-ok" : "text-12 text-muted"}>
          {channel.ready ? "Ready" : channel.provider ? "Not fully configured" : "Off"}
        </span>
      </div>

      {channel.error && (
        <Alert tone="err" title={`${channel.label} refused its credentials`} dismissible={false}>
          {channel.error}
          <span className="mt-1 block">Fix the details below and send a test to clear this.</span>
        </Alert>
      )}

      <Field label="Provider" htmlFor={selectId} hint={option?.blurb ?? "Off: nothing is sent on this channel and no opt-in is offered for it."} variant="float-static">
        <Select id={selectId} name={selectId} value={chosen} onChange={(e) => setChosen(e.target.value)}>
          <option value="">Off</option>
          {channel.providers.map((p) => (
            <option key={p.value} value={p.value} disabled={!p.available}>
              {p.label}{p.available ? "" : " — needs OpenSSL"}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-x-4 sm:grid-cols-2">
        {fields.map((key) => {
          const meta = FIELDS[key] ?? { label: key };
          const data = row(key);
          if (!data) return null;
          const id = `setting__${key}`;
          const isSecret = Boolean(data.is_secret);

          return (
            <div key={key} hidden={!inUse.has(key)}>
              <Field
                label={meta.label} htmlFor={id}
                hint={[meta.hint, isSecret && data.is_set ? "Saved — leave blank to keep it, or type a new one to replace it." : null].filter(Boolean).join(" ") || undefined}
              >
                <Input
                  id={id} name={id} type={isSecret ? "password" : "text"} autoComplete={isSecret ? "new-password" : "off"}
                  defaultValue={isSecret ? "" : (data.value ?? "")}
                  placeholder={isSecret && data.is_set ? "••••••••  (saved)" : meta.placeholder}
                />
              </Field>
              {isSecret && data.is_set && <ClearSecretButton settingKey={key} label={meta.label} />}
            </div>
          );
        })}
      </div>

      {option?.webhook_url && (
        <div className="mb-4 rounded border border-line-strong bg-surface-2 p-3 text-12-5 text-muted">
          <p className="mb-1 font-semibold text-ink">Webhook URL for {option.label}</p>
          <code className="block break-all font-mono text-12 text-ink">
            {option.webhook_url}{option.webhook_secret_param ? "?token=<the shared secret below>" : ""}
          </code>
          <p className="mt-1">Paste it into the provider&apos;s callback settings: delivery reports, STOP replies{channel.needs_approval ? " and template approvals" : ""} arrive here.</p>
        </div>
      )}

      {result.error && <Alert tone="err" title="The test did not go">{result.error}</Alert>}
      {result.ok && <Alert tone="ok" title="Sent">{result.ok}</Alert>}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 sm:max-w-[22rem]">
          {/* No `name`: an argument to one press, never a setting. */}
          <Field label={channel.address_kind === "phone" ? "Send a test to (mobile)" : "Send a test to (registration token)"} htmlFor={`${channel.value}_test_to`}>
            <Input
              id={`${channel.value}_test_to`} autoComplete="off" value={to}
              inputMode={channel.address_kind === "phone" ? "tel" : undefined}
              placeholder={channel.address_kind === "phone" ? "98765 43210" : "Paste a token"}
              onChange={(e) => setTo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (!busy) test();
              }}
            />
          </Field>
        </div>
        <Button type="button" variant="secondary" size="sm" className="mb-[18px]" disabled={busy || !to.trim()} onClick={test}>
          {busy ? "Sending…" : "Send"}
        </Button>
      </div>
      <p className="measure text-12-5 text-muted">
        Uses what is <em>saved</em>, so save first. The message is one fixed sentence.
        {channel.value === "whatsapp" ? " Meta's test sends its hello_world template, which every business account has." : ""}
      </p>
    </section>
  );
}
