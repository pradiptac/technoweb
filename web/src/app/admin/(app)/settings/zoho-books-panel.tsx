"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Field, Select } from "@/components/ui/input";
import type { SettingGroups } from "@/lib/admin";
import type { ZohoBooksStatus } from "@/types/zoho";
import { MailboxConnection } from "./mailbox-connection";
import { connectZohoBooksAction, disconnectZohoBooksAction, testZohoBooksAction, type ZohoResult } from "./zoho-actions";

/**
 * Under the Zoho Books fields on Store → Settings (docs/store.md "Zoho Books
 * invoices"): the account, the three choices only Zoho can offer — the
 * organisation and the two taxes — a test, and where things stand.
 *
 * The three selects are named `setting__<key>`, so they save through the
 * same action as every field above them; their options are Zoho's own lists,
 * read when the screen opens. Until an account is connected there is nothing
 * to list, so they are not drawn — and a key that is not posted is left
 * alone, so a save from this tab cannot blank a choice it could not show.
 *
 * A saved choice Zoho no longer lists (a tax an accountant deleted) is kept
 * as an option marked as gone rather than dropped: a select whose current
 * value is absent quietly reassigns itself to the first option on the next
 * save.
 */
export function ZohoBooksPanel({ status, rows }: { status?: ZohoBooksStatus; rows: SettingGroups[string] }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<ZohoResult>({});
  const run = (action: () => Promise<ZohoResult>) => start(async () => setResult(await action()));

  const saved = (key: string) => String(rows.find((r) => r.key === key)?.value ?? "");

  if (!status) {
    return (
      <div className="mt-2 border-t border-line pt-4 sm:col-span-2">
        <Alert tone="warn" title="The connection could not be read" dismissible={false}>
          The Zoho Books status did not load. The fields above still save; reload to try again.
        </Alert>
      </div>
    );
  }

  const organization = saved("zoho_books_organization_id");
  const taxLabel = (t: ZohoBooksStatus["taxes"][number]) => `${t.name} (${t.percentage}%)`;

  return (
    <div className="mt-2 grid min-w-0 gap-5 border-t border-line pt-4 sm:col-span-2">
      {/*
        The data centre and the state are drawn here rather than by the
        generic select, which starts on its first option: with no state
        chosen it showed "Andaman and Nicobar Islands", and the next save —
        from any tab — stored it. A blank first option is the honest "not
        chosen yet", and the API reads blank as exactly that. The data centre
        sits beside it so the two make one row, above the Connect button it
        decides the address of.
      */}
      <div className="grid min-w-0 gap-x-5 sm:grid-cols-2">
        <Field
          label="Zoho data centre"
          htmlFor="setting__zoho_books_dc"
          variant="float-static"
          hint="Where your Zoho account lives: the address you sign in at. An Indian account is zoho.in. Save before connecting."
        >
          <Select id="setting__zoho_books_dc" name="setting__zoho_books_dc" defaultValue={saved("zoho_books_dc") || "in"}>
            {(rows.find((r) => r.key === "zoho_books_dc")?.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>

        <Field
          label="Your state (place of business)"
          htmlFor="setting__zoho_books_home_state"
          variant="float-static"
          hint="The state your GSTIN is registered in. A sale delivered inside it carries CGST and SGST; one to any other state carries IGST."
        >
          <Select id="setting__zoho_books_home_state" name="setting__zoho_books_home_state" defaultValue={saved("zoho_books_home_state")}>
            <option value="">Choose…</option>
            {(rows.find((r) => r.key === "zoho_books_home_state")?.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div>
        {status.error && !result.ok && !result.error && (
          <Alert tone="warn" title="Zoho Books refused the last request" dismissible={false}>{status.error}</Alert>
        )}
        {result.error && <Alert tone="err" title="That did not work">{result.error}</Alert>}
        {result.ok && !result.error && <Alert tone="ok" title="Done">{result.ok}</Alert>}

        <MailboxConnection
          account={status.account}
          connectedAt={status.connected_at}
          isConnected={status.is_connected}
          providerLabel="Zoho"
          busy={busy}
          onConnect={() => run(connectZohoBooksAction)}
          onDisconnect={() => run(disconnectZohoBooksAction)}
          connectLabel="Connect Zoho Books"
          emptyLabel="No Zoho account connected"
          disconnectWarning="No invoices will be made in Zoho Books until an account is connected again. Invoices already made stay where they are."
          hint={status.client_configured
            ? "Sign in to Zoho as a user who can create invoices in Zoho Books."
            : "Save the client ID and secret above first."}
        />
        <p className="mt-2 text-12-5 text-muted">
          In the Zoho API Console, create a <span className="font-semibold">Server-based Application</span> and give it
          this redirect address: <code className="font-mono text-12">{status.callback_path}</code> on this site&apos;s
          address.
        </p>
      </div>

      {status.is_connected && (
        <div className="grid min-w-0 gap-x-5 sm:grid-cols-2">
          <Field
            label="Zoho Books organisation"
            htmlFor="setting__zoho_books_organization_id"
            variant="float-static"
            hint="The books the invoices go into. Save after choosing, and the taxes appear."
          >
            <Select id="setting__zoho_books_organization_id" name="setting__zoho_books_organization_id" defaultValue={organization}>
              <option value="">Choose…</option>
              {status.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              {organization && !status.organizations.some((o) => o.id === organization) && (
                <option value={organization}>The one saved ({organization}) — not listed by Zoho now</option>
              )}
            </Select>
          </Field>

          {status.taxes.length > 0 || saved("zoho_books_tax_intra") || saved("zoho_books_tax_inter") ? (
            <>
              <TaxSelect
                id="zoho_books_tax_intra"
                label="Tax for sales inside your state"
                hint="Usually the GST group that splits into CGST and SGST — “GST18”."
                value={saved("zoho_books_tax_intra")}
                taxes={status.taxes}
                label_={taxLabel}
              />
              <TaxSelect
                id="zoho_books_tax_inter"
                label="Tax for sales to other states"
                hint="Usually IGST at the same rate — “IGST18”."
                value={saved("zoho_books_tax_inter")}
                taxes={status.taxes}
                label_={taxLabel}
              />
            </>
          ) : (
            <p className="mb-[18px] self-center text-13 text-muted">
              Choose the organisation and save: its taxes are then listed here to choose from.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-3">
        {status.ready ? (
          <Alert tone="ok" title="Invoices are being made" dismissible={false}>
            Each order gets its invoice in Zoho Books when it is due, and the PDF is attached to the order for the
            customer.
            {(status.waiting > 0 || status.failed > 0) && (
              <span className="mt-1 block">
                {status.waiting > 0 && `${status.waiting} waiting to be made. `}
                {status.failed > 0 && (
                  <Link href="/admin/store/orders?zoho=failed" className="font-semibold underline">
                    {status.failed} refused by Zoho — open {status.failed === 1 ? "it" : "them"}
                  </Link>
                )}
              </span>
            )}
          </Alert>
        ) : (
          <Alert tone="info" title={status.enabled ? "Not making invoices yet" : "Switched off"} dismissible={false}>
            {status.missing.length > 0
              ? <>Still to do: {status.missing.join(" ")}{!status.enabled && " Then switch it on above."}</>
              : "Everything is set up. Tick “Create invoices in Zoho Books” above and save."}
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="sm" disabled={busy || !status.is_connected} onClick={() => run(testZohoBooksAction)}>
            {busy ? "Testing…" : "Test the connection"}
          </Button>
          <p className="measure text-12-5 text-muted">
            {status.is_connected
              ? "Uses what is saved, not what is on screen — so save first. Zoho's answer is shown here in its own words."
              : "Connect a Zoho account first."}
          </p>
        </div>

        <p className="measure text-12-5 text-muted">
          An invoice is made as <span className="font-semibold">sent</span>, with prices that include GST. Payments are
          not recorded in Zoho — record each one there, or it shows as unpaid. An order that already has an uploaded
          invoice is left alone.
        </p>
      </div>
    </div>
  );
}

function TaxSelect({
  id, label, hint, value, taxes, label_,
}: {
  id: string; label: string; hint: string; value: string;
  taxes: ZohoBooksStatus["taxes"];
  label_: (t: ZohoBooksStatus["taxes"][number]) => string;
}) {
  return (
    <Field label={label} htmlFor={`setting__${id}`} variant="float-static" hint={hint}>
      <Select id={`setting__${id}`} name={`setting__${id}`} defaultValue={value}>
        <option value="">Choose…</option>
        {taxes.map((t) => <option key={t.id} value={t.id}>{label_(t)}</option>)}
        {value && !taxes.some((t) => t.id === value) && <option value={value}>The one saved — not listed by Zoho now</option>}
      </Select>
    </Field>
  );
}
