"use client";

import { useActionState, useState, useTransition } from "react";
import { RecordSwitch } from "@/components/admin/record-switch";
import { FormActions } from "@/components/admin/form-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { relativeTime } from "@/lib/dates";
import type { PushConfig } from "@/lib/push";
import type { NotificationMeta, NotificationPrefs } from "@/types/notifications";
import {
  removePushAction, saveNotificationsAction, sendTestAlertAction, sendTestDigestAction, subscribePushAction,
  type NotificationsState,
} from "@/app/admin/(app)/profile/notifications-actions";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const initial: NotificationsState = {};

/**
 * A staff member's digest and alert choices (docs/digest-alerts.md). The form
 * saves through one action; the browser and "try it" controls sit outside it,
 * because they act at once and are not part of what Save sends.
 */
export function NotificationsPanel({ prefs, meta, pushConfig }: {
  prefs: NotificationPrefs; meta: NotificationMeta; pushConfig: PushConfig | null;
}) {
  const [state, formAction, pending] = useActionState(saveNotificationsAction, initial);
  const [digest, setDigest] = useState(prefs.digest);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <div className="grid gap-8">
      {/* Keyed on what is saved: React resets a form after a successful action, and a mounted select would go back to the old default. */}
      <Form key={JSON.stringify(prefs)} action={formAction} state={state} noValidate className="grid gap-6">
        {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
        {state.ok && !state.error && <Alert tone="ok" title={state.ok}>Your notification settings are saved.</Alert>}
        {!meta.self && <input type="hidden" name="user_id" value={meta.user.id} />}

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-13-5 font-semibold text-ink">Digest</legend>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <Field label="How often" htmlFor="digest" variant="float-static" error={err("digest")}>
              <Select id="digest" name="digest" defaultValue={prefs.digest} onChange={(e) => setDigest(e.currentTarget.value as NotificationPrefs["digest"])}>
                {meta.digests.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </Select>
            </Field>
            <Field label="At" htmlFor="digest_hour" variant="float-static" error={err("digest_hour")}>
              <Select id="digest_hour" name="digest_hour" defaultValue={String(prefs.digest_hour)}>
                {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </Select>
            </Field>
            {/* Kept mounted while hidden so the day still posts. */}
            <div hidden={digest !== "weekly"}>
              <Field label="On" htmlFor="digest_weekday" variant="float-static" error={err("digest_weekday")}>
                <Select id="digest_weekday" name="digest_weekday" defaultValue={String(prefs.digest_weekday)}>
                  {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
                </Select>
              </Field>
            </div>
          </div>
          <RecordSwitch name="digest_skip_quiet" defaultChecked={prefs.digest_skip_quiet} label="Skip a day when everything is zero" />
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-13-5 font-semibold text-ink">Alerts</legend>
          {err("alerts") && <p className="text-12-5 text-err">{err("alerts")}</p>}
          {meta.rules.map((rule) => (
            <div key={rule.key}>
              {/* A disabled switch posts nothing, so its key is left out and the stored choice kept. */}
              {rule.site_enabled && <input type="hidden" name="alert_keys" value={rule.key} />}
              <RecordSwitch
                name={`alert__${rule.key}`}
                defaultChecked={prefs.alerts[rule.key] ?? true}
                disabled={!rule.site_enabled}
                label={rule.label}
                hint={rule.site_enabled ? rule.threshold_label : "Switched off for everybody in Settings → Alerts."}
              />
            </div>
          ))}
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-13-5 font-semibold text-ink">How alerts reach you</legend>
          <RecordSwitch name="alert_email" defaultChecked={prefs.alert_email} label="Email" />
          <RecordSwitch name="alert_push" defaultChecked={prefs.alert_push} label="Browser notifications" />
          <p className="text-12-5 text-muted">Quiet hours for browser notifications (email still arrives)</p>
          <div className="grid max-w-[360px] grid-cols-2 gap-x-4">
            <Field label="From" htmlFor="quiet_start" variant="float-static" error={err("quiet_start")}>
              <Input id="quiet_start" name="quiet_start" type="time" defaultValue={prefs.quiet_start} />
            </Field>
            <Field label="Until" htmlFor="quiet_end" variant="float-static" error={err("quiet_end")}>
              <Input id="quiet_end" name="quiet_end" type="time" defaultValue={prefs.quiet_end} />
            </Field>
          </div>
        </fieldset>

        <FormActions>
          <Button type="submit" pending={pending}>{pending ? "Saving…" : "Save notification settings"}</Button>
        </FormActions>
      </Form>

      {meta.self && <ThisBrowser pushConfig={pushConfig} />}
      <Browsers meta={meta} />
      {meta.self && <TryIt />}
    </div>
  );
}

function ThisBrowser({ pushConfig }: { pushConfig: PushConfig | null }) {
  const [busy, start] = useTransition();
  const [outcome, setOutcome] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  if (!pushConfig) return <p className="text-13 text-muted">Browser notifications are not set up on this site.</p>;

  return (
    <section className="grid gap-2">
      <h3 className="text-13-5 font-semibold text-ink">This browser</h3>
      {outcome && <Alert tone={outcome.tone} title={outcome.tone === "ok" ? "Done" : "Could not turn them on"}>{outcome.text}</Alert>}
      <div>
        <Button
          type="button" size="sm" variant="secondary" pending={busy}
          onClick={() => start(async () => {
            try {
              const { subscribe } = await import("@/lib/push-client");
              await subscribePushAction(await subscribe(pushConfig));
              setOutcome({ tone: "ok", text: "This browser will show your alerts." });
            } catch (e) {
              setOutcome({ tone: "err", text: e instanceof Error ? e.message : "Something went wrong." });
            }
          })}
        >
          Get alerts in this browser
        </Button>
      </div>
    </section>
  );
}

function Browsers({ meta }: { meta: NotificationMeta }) {
  const [busy, start] = useTransition();
  if (meta.browsers.length === 0) return null;

  return (
    <section className="grid gap-2">
      <h3 className="text-13-5 font-semibold text-ink">Browsers</h3>
      <ul className="grid gap-2">
        {meta.browsers.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-3 text-13">
            <span className="font-semibold text-ink">{b.label ?? "A browser"}</span>
            <span className="text-muted">Last seen {relativeTime(b.last_seen_at)}</span>
            {b.failed && <Badge tone="urgent">Not reachable</Badge>}
            {/* Never unsubscribe(): a customer subscription in the same browser shares the token. */}
            {meta.self && (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => start(() => removePushAction(b.id))}>
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TryIt() {
  const [busy, start] = useTransition();
  const [which, setWhich] = useState<"digest" | "alert" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const run = (kind: "digest" | "alert", send: () => Promise<string>) => {
    setWhich(kind);
    start(async () => { setMessage(await send()); });
  };

  return (
    <section className="grid gap-2">
      <h3 className="text-13-5 font-semibold text-ink">Try it</h3>
      {message && <Alert tone="ok" title="Sent">{message}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button type="button" size="sm" variant="secondary" disabled={busy} pending={busy && which === "digest"} onClick={() => run("digest", sendTestDigestAction)}>
          Send me today&rsquo;s digest
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} pending={busy && which === "alert"} onClick={() => run("alert", sendTestAlertAction)}>
          Send a test alert
        </Button>
      </div>
    </section>
  );
}
