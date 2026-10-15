"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import type { SettingGroups } from "@/lib/admin";
import type { ShiprocketStatus } from "@/types/courier";
import { testShiprocketAction, type ShiprocketResult } from "./shiprocket-actions";

/**
 * Under the Shiprocket fields on Store → Settings (docs/store.md
 * "Shiprocket"): the pickup location only Shiprocket can list, the address to
 * paste into its webhook settings, a test, and where things stand.
 *
 * **Nothing here books anything**, and the page says so. Shiprocket has no
 * sandbox; the test signs in and lists the pickup locations and that is all.
 *
 * The pickup location is a select named `setting__shiprocket_pickup_location`
 * so it saves through the same action as every field above it. It lists
 * Shiprocket's own locations, which the API reads only while the provider is
 * switched on and a sign-in is saved — so on "By hand" there is nothing to
 * list and nothing is posted. A saved choice Shiprocket no longer lists is
 * kept as an option marked as gone: a select whose current value is absent
 * quietly reassigns itself to the first option on the next save.
 */
export function ShiprocketPanel({ status, rows }: { status?: ShiprocketStatus; rows: SettingGroups[string] }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<ShiprocketResult>({});
  const [copied, setCopied] = useState(false);

  const saved = (key: string) => String(rows.find((r) => r.key === key)?.value ?? "");

  if (!status) {
    return (
      <div className="mt-2 border-t border-line pt-4 sm:col-span-2" data-shiprocket-panel="unavailable">
        <Alert tone="warn" title="The connection could not be read" dismissible={false}>
          The Shiprocket status did not load. The fields above still save; reload to try again.
        </Alert>
      </div>
    );
  }

  const pickup = saved("shiprocket_pickup_location");
  const on = status.provider === "shiprocket";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(status.webhook_url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A browser that refuses the clipboard still has the address in a field to select.
    }
  };

  return (
    <div className="mt-2 grid min-w-0 gap-5 border-t border-line pt-4 sm:col-span-2" data-shiprocket-panel={status.provider}>
      {on && (
        status.locations.length > 0 || pickup ? (
          <div className="grid min-w-0 gap-x-5 sm:grid-cols-2">
            <Field
              label="Pickup location"
              htmlFor="setting__shiprocket_pickup_location"
              variant="float-static"
              hint="The address in Shiprocket the courier collects parcels from. Save after choosing."
            >
              <Select id="setting__shiprocket_pickup_location" name="setting__shiprocket_pickup_location" defaultValue={pickup}>
                <option value="">Choose…</option>
                {status.locations.map((l) => (
                  <option key={l.name} value={l.name}>{l.name}{l.city ? ` — ${l.city}` : ""}</option>
                ))}
                {pickup && !status.locations.some((l) => l.name === pickup) && (
                  <option value={pickup}>{pickup} — not listed by Shiprocket now</option>
                )}
              </Select>
            </Field>
          </div>
        ) : (
          <p className="text-13 text-muted">
            Save the API user above and the pickup locations from your Shiprocket account are listed here to choose from.
          </p>
        )
      )}

      {!on && (
        <p className="measure text-13 text-muted">
          Parcels are booked by hand. Choose <span className="font-semibold">Shiprocket</span> above, save, and the sign-in
          and pickup location are offered here.
        </p>
      )}

      <section className="grid min-w-0 gap-2" aria-labelledby="shiprocket-webhook-heading">
        <h3 id="shiprocket-webhook-heading" className="text-14 font-semibold">Tracking address</h3>
        <p className="measure text-12-5 text-muted">
          In Shiprocket, open <span className="font-semibold">Settings → API → Webhooks</span>, paste this address, switch it
          on and enter the same token as above. Shiprocket then tells this site when a parcel is picked up and delivered;
          without it the site asks every half hour instead.
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Input
            id="shiprocket-webhook-url"
            readOnly
            value={status.webhook_url}
            aria-label="Webhook address"
            className="min-w-0 flex-1 font-mono text-13"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button type="button" variant="secondary" size="sm" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
        </div>
        {!status.webhook_url_ok && (
          <Alert tone="warn" title="Shiprocket will refuse this address" dismissible={false}>
            It contains a word Shiprocket does not allow in a webhook address (&ldquo;shiprocket&rdquo;, &ldquo;kartrocket&rdquo;,
            &ldquo;sr&rdquo; or &ldquo;kr&rdquo;). Use a different domain for the API, or ask your host to forward a clean address.
          </Alert>
        )}
        {!status.webhook_token_set && (
          <p className="text-12-5 text-muted">No webhook token is saved yet, so nothing Shiprocket sends would be accepted.</p>
        )}
      </section>

      <div className="grid gap-3">
        {status.error && !result.ok && !result.error && (
          <Alert tone="warn" title="Shiprocket refused the last request" dismissible={false}>{status.error}</Alert>
        )}
        {result.error && <Alert tone="err" title="That did not work">{result.error}</Alert>}
        {result.ok && !result.error && <Alert tone="ok" title="Done">{result.ok}</Alert>}

        {on && (
          status.active ? (
            <Alert tone="ok" title="Booking is on" dismissible={false}>
              Each paid order, and each cash-on-delivery one, gets a Book button on its page.
              {status.booked > 0 && ` ${status.booked} ${status.booked === 1 ? "parcel is" : "parcels are"} booked.`}
              {status.in_trouble > 0 && (
                <span className="mt-1 block">
                  <Link href="/admin/store/orders?shipment=problem" className="font-semibold underline">
                    {status.in_trouble} coming back or cancelled — open {status.in_trouble === 1 ? "it" : "them"}
                  </Link>
                </span>
              )}
            </Alert>
          ) : (
            <Alert tone="info" title="Not booking yet" dismissible={false}>
              Still to do: {status.missing.join(" ") || "save and reload."}
            </Alert>
          )
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy || !status.credentials_saved}
            onClick={() => start(async () => setResult(await testShiprocketAction()))}
          >
            {busy ? "Testing…" : "Test the connection"}
          </Button>
          <p className="measure text-12-5 text-muted">
            {status.credentials_saved
              ? "Signs in and lists your pickup locations — nothing is booked. Uses what is saved, so save first."
              : "Save the API user's email and password first."}
          </p>
        </div>

        <p className="measure text-12-5 text-muted">
          Shiprocket has no test mode: everything pressed on an order acts on your real account, and a courier assigned
          is paid for from your Shiprocket wallet. Weights are sent in kilograms and sizes in centimetres.
        </p>
      </div>
    </div>
  );
}
