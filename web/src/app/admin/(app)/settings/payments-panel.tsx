"use client";

import { useState } from "react";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ClearSecretButton } from "./clear-secret-button";
// Types only. `lib/admin.ts` is server-only, and a type import is
// erased at compile time — the rule that file documents.
import type { PaymentsMeta, SettingRow } from "@/lib/admin";

/**
 * Choosing a gateway, and the two things somebody has to do at the other end.
 *
 * A panel of its own rather than the generic field renderer, for the reason the
 * mail panel has one: which fields exist depends on the provider chosen, and
 * this carries information that is not a setting at all — the webhook URL and
 * the events to subscribe to.
 *
 * **The webhook is the half that settles orders**, and it is configured in the
 * gateway's dashboard rather than here. Nothing in this console can tell
 * whether it has been done; the symptom of forgetting is that money is taken
 * and every order stays "pending payment" for ever, which reads as the shop
 * being broken rather than as a box left unticked. So it is stated on the
 * screen where the keys are pasted, at the moment somebody is already in the
 * Razorpay dashboard with it open.
 *
 * The URL comes from the API, which generates it from its own route table — a
 * URL written into this template would keep pointing at the old path after
 * somebody moved the route, silently.
 */
export function PaymentsPanel({ meta, rows }: { meta: PaymentsMeta; rows: SettingRow[] }) {
  const stored = (key: string) => rows.find((r) => r.key === key);
  const [gateway, setGateway] = useState(stored("payment_gateway")?.value ?? "");

  const chosen = meta.gateways.find((g) => g.value === gateway);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(meta.webhook_url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 4000);
    } catch {
      // Clipboard access is refused in plenty of ordinary situations — an
      // insecure origin, a locked-down browser. The URL is selectable text
      // either way, so this fails quietly rather than claiming it copied.
      setCopied(false);
    }
  };

  return (
    <div className="mb-6">
      <Field
        label="Payment gateway"
        htmlFor="setting__payment_gateway"
        variant="float-static"
        hint="Leave unset to take no payments online. The shop then says so rather than offering a button that fails."
      >
        <Select
          id="setting__payment_gateway"
          name="setting__payment_gateway"
          value={gateway}
          onChange={(e) => setGateway(e.target.value)}
        >
          <option value="">Not set up</option>
          {meta.gateways.map((g) => (
            /*
              Disabled with the reason rather than hidden — the pattern the mail
              panel uses for an uninstalled transport. A missing option is a
              question somebody has to go and ask a colleague.
            */
            <option key={g.value} value={g.value} disabled={!g.implemented}>
              {g.label}{g.implemented ? "" : " — not built yet"}
            </option>
          ))}
        </Select>
      </Field>

      {chosen && (
        <>
          <div className="mb-4 grid gap-x-5 sm:grid-cols-2">
            {chosen.fields.map((field) => {
              const row = stored(field.key);
              const id = `setting__${field.key}`;

              return (
                <Field
                  key={field.key}
                  label={field.label}
                  htmlFor={id}
                  hint={
                    field.secret && row?.is_set
                      ? `${field.hint} Stored. Leave blank to keep it.`
                      : field.hint
                  }
                >
                  <span className="flex items-center gap-2">
                    <Input
                      id={id}
                      name={id}
                      /*
                        A stored secret is never sent back, so the field is
                        always empty and a blank submit means "unchanged" —
                        the settings API's own rule. Treating blank as a delete
                        would wipe the key secret on every unrelated save.
                      */
                      defaultValue={field.secret ? "" : (row?.value ?? "")}
                      type={field.secret ? "password" : "text"}
                      autoComplete="off"
                      className="font-mono text-[14px]"
                      placeholder={field.secret && row?.is_set ? "••••••••" : undefined}
                    />
                    {field.secret && row?.is_set && <ClearSecretButton settingKey={field.key} label={field.label} />}
                  </span>
                </Field>
              );
            })}
          </div>

          {/*
            Not a setting, and not optional either.

            Everything above is stored here; this is a thing to do in somebody
            else's dashboard, and the only place it can usefully be said is
            beside the keys being copied out of that same dashboard.
          */}
          <section className="rounded-lg border border-line-strong bg-surface-2 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-[13.5px] font-semibold">Then register the webhook</h3>
              <Badge tone="open">Do this in the {chosen.label} dashboard</Badge>
            </div>

            <p className="measure mb-3 text-[12.5px] text-muted">
              The webhook is what actually marks an order paid — a browser can close, lose signal
              or be blocked, and this arrives anyway. Without it money is taken and every order
              stays at &ldquo;pending payment&rdquo;, which reads as the shop being broken.
            </p>

            <div className="mb-1 text-[12px] font-semibold text-faint">Endpoint URL</div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Wide content scrolls in its own box rather than the page. */}
              <pre className="min-w-0 flex-1 overflow-x-auto rounded border border-line bg-card px-2.5 py-2 text-[12px] text-ink">
                <code>{meta.webhook_url}</code>
              </pre>
              <button
                type="button"
                onClick={copy}
                className="rounded border border-line-strong bg-card px-3 py-2 text-[12.5px] font-semibold hover:bg-surface"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="mt-3 mb-1 text-[12px] font-semibold text-faint">Events to subscribe to</div>
            <ul className="flex flex-wrap gap-2">
              {meta.webhook_events.map((event) => (
                <li key={event} className="rounded border border-line bg-card px-2 py-1 font-mono text-[12px]">
                  {event}
                </li>
              ))}
            </ul>

            <p className="measure mt-3 text-[12.5px] text-muted">
              The <strong>webhook secret</strong> above is a different secret from the key secret:{" "}
              {chosen.label} shows it when the webhook is created, and it must match what is stored
              here. Using the wrong one produces a signature that never verifies, which looks
              exactly like payments having stopped for no reason.
            </p>
          </section>

          {/*
            What this server can actually do, read live rather than assumed.
            The same treatment the mail panel gives an uninstalled transport.
          */}
          {!chosen.configured && chosen.implemented && (
            <Alert tone="warn" title="Not ready to take payments" dismissible={false}>
              {chosen.reason} The shop is showing &ldquo;online payment is not available&rdquo;
              until then, and will still take orders.
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
