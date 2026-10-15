"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormActions } from "@/components/admin/form-actions";
import { SettingSwitch } from "@/components/admin/setting-switch";
import { CoverField } from "@/components/admin/cover-field";
import { formatPaise } from "@/lib/money";
import { LABELS } from "../../settings/settings-copy";
import { saveInvoicingAction, type InvoicingFormState } from "../actions";
import type { InvoicingMeta, SettingRow } from "@/lib/admin";

const initial: InvoicingFormState = {};

/**
 * Store → Tax and invoicing (0.176.0).
 *
 * Every control posts under `setting__<key>`, the contract the settings
 * screens established, so one action reads them all and the API refuses any
 * key outside its sixteen by name. **Nothing here lists a rate, a basis or a
 * state** — all three arrive as `options` on their row, so the console and
 * the validation cannot drift.
 *
 * The switch is drawn last on purpose, under what it needs: `meta.missing`
 * is the API's own list of what is still wanted, and turning the feature on
 * above it would read as "done" over a form that is not.
 */
/** ₹1,000 with the shop's rate on it, the way the API adds it. */
function example(rate: string): string {
  const bp = Math.round(parseFloat(rate) * 100);
  return formatPaise(100000 + Math.floor((100000 * bp + 5000) / 10000), { withPaise: true });
}

export function InvoicingForm({ rows, meta }: { rows: SettingRow[]; meta: InvoicingMeta }) {
  const [state, formAction, pending] = useActionState(saveInvoicingAction, initial);

  const byKey = Object.fromEntries(rows.map((r) => [r.key, r])) as Record<string, SettingRow | undefined>;
  const value = (key: string) => byKey[key]?.value ?? "";
  const label = (key: string) => LABELS[key] ?? { label: key };

  const [enabled, setEnabled] = useState(value("invoice_enabled") === "1");
  const [basis, setBasis] = useState(value("store_price_basis") || "inclusive");
  const [entry, setEntry] = useState(value("store_price_entry") || "inclusive");

  const text = (key: string, props: { wide?: boolean } = {}) => (
    <Field
      key={key}
      label={label(key).label}
      htmlFor={`setting__${key}`}
      hint={label(key).hint}
      className={props.wide ? "sm:col-span-2" : undefined}
    >
      <Input id={`setting__${key}`} name={`setting__${key}`} defaultValue={value(key)} placeholder={label(key).placeholder} />
    </Field>
  );

  const area = (key: string) => (
    <Field key={key} label={label(key).label} htmlFor={`setting__${key}`} hint={label(key).hint} className="sm:col-span-2">
      <Textarea id={`setting__${key}`} name={`setting__${key}`} rows={3} defaultValue={value(key)} />
    </Field>
  );

  const choice = (key: string, onChange?: (v: string) => void) => (
    <Field key={key} label={label(key).label} htmlFor={`setting__${key}`} hint={label(key).hint} variant="float-static">
      <Select
        id={`setting__${key}`}
        name={`setting__${key}`}
        defaultValue={value(key) || byKey[key]?.options?.[0]?.value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      >
        {(byKey[key]?.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </Field>
  );

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {state.ok && !state.error && (
        <Alert tone="ok" title="Tax and invoicing saved">Orders paid from now on use it.</Alert>
      )}

      {meta.zoho_active && (
        <Alert tone="info" title="Zoho Books is making your invoices" dismissible={false}>
          While Zoho Books is connected it issues the numbers and the documents, so nothing is generated here.
          The rate and the prices below still apply to the shop. Disconnect Zoho Books under{" "}
          <Link href="/admin/settings/store" className="font-semibold underline">Settings → Store</Link> to use these instead.
        </Alert>
      )}

      {/* --------------------------------------------------------- the tax */}

      <h2 className="mb-1 text-15-5 font-semibold">GST</h2>
      <p className="measure mb-4 text-13 text-muted">
        One rate for the shop, and a product may name its own on its Pricing tab.
        Changing either applies to what is sold from now on — every order keeps the tax it was charged, so
        nothing already placed moves.
      </p>

      <div className="mb-3 grid gap-x-5 sm:grid-cols-2">
        {choice("store_gst_percent")}
        <span className="hidden sm:block" aria-hidden />
        {choice("store_price_entry", setEntry)}
        {choice("store_price_basis", setBasis)}
      </div>

      {/*
        0.178.0: the shop keeps every price with GST in it, so these two
        only change how a price is typed and how it is shown. Switching
        either never changes what anybody pays, and the sentence says so
        with the worked example at the shop's own rate.
      */}
      <p className="measure mb-8 text-13 text-muted" role="status">
        At {meta.rate}: {entry === "exclusive"
          ? <>you type ₹1,000 and the shop keeps {example(meta.rate)}, what the customer pays.</>
          : <>you type {example(meta.rate)}, what the customer pays.</>}{" "}
        {basis === "exclusive"
          ? <>The website shows ₹1,000 and adds the GST at the checkout.</>
          : <>The website shows {example(meta.rate)}.</>}{" "}
        Switching either setting never changes what a customer pays.
        {meta.products_with_own_rate > 0 && (
          <>
            {" "}<strong className="font-semibold text-ink-2">{meta.products_with_own_rate}</strong>
            {meta.products_with_own_rate === 1 ? " product sets" : " products set"} a rate of their own, which beats this one.
          </>
        )}
      </p>

      {/* ------------------------------------------------------ the seller */}

      <h2 className="mb-1 text-15-5 font-semibold">Who the invoice is from</h2>
      <p className="measure mb-4 text-13 text-muted">
        This is printed on every invoice and is what makes it a tax invoice rather than a receipt.
        The state decides whether a sale is CGST and SGST or IGST, so it is not optional.
      </p>

      <div className="mb-8 grid gap-x-5 sm:grid-cols-2">
        {text("invoice_legal_name", { wide: true })}
        {text("invoice_gstin")}
        {choice("invoice_state")}
        {area("invoice_address")}
        {text("invoice_email")}
        {text("invoice_phone")}
      </div>

      {/* ----------------------------------------------------- the document */}

      <h2 className="mb-1 text-15-5 font-semibold">The document</h2>
      <p className="measure mb-4 text-13 text-muted">
        Invoice numbers are their own series, counted per financial year and starting again each April —
        this year is <strong className="font-semibold text-ink-2">{meta.financial_year}</strong>.
        They are nothing to do with order numbers.
      </p>

      <div className="mb-3 grid gap-x-5 sm:grid-cols-2">
        {text("invoice_prefix")}
        {text("invoice_hsn_default")}
        {area("invoice_terms")}
        {area("invoice_declaration")}
        {text("invoice_signatory")}
      </div>

      <div className="mb-3">
        <CoverField
          name="setting__invoice_signature_path"
          label={label("invoice_signature_path").label}
          hint={label("invoice_signature_path").hint}
          defaultPath={value("invoice_signature_path") || null}
          defaultUrl={byKey.invoice_signature_path?.url ?? null}
        />
      </div>

      {meta.products_without_hsn > 0 && (
        <Alert tone="warn" title="Some products have no HSN code" dismissible={false}>
          <strong className="font-semibold">{meta.products_without_hsn}</strong>{" "}
          {meta.products_without_hsn === 1 ? "product has" : "products have"} no code of their own.
          Those lines print the default above, and without a default they print a dash — which a tax invoice should not.{" "}
          <Link href="/admin/store/products" className="font-semibold underline">Open the products</Link>.
        </Alert>
      )}

      {/* ------------------------------------------------------ the switch */}

      <h2 className="mt-8 mb-1 text-15-5 font-semibold">Issuing</h2>
      <p className="measure mb-4 text-13 text-muted">
        Switched on, an order makes its invoice the moment it is paid, and the customer can download it from
        their order page. An invoice you upload by hand on an order always wins and is never replaced.
        {meta.issued > 0 && <> <strong className="font-semibold text-ink-2">{meta.issued}</strong> {meta.issued === 1 ? "has" : "have"} been issued so far.</>}
      </p>

      {meta.missing.length > 0 && (
        <Alert tone="warn" title="Not ready to issue yet" dismissible={false}>
          <ul className="list-disc space-y-1 pl-5">
            {meta.missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </Alert>
      )}

      <div className="grid gap-3 rounded-lg border border-line-strong bg-surface px-4 py-4">
        <SettingSwitch
          id="invoice-enabled"
          name="setting__invoice_enabled"
          checked={enabled}
          onChange={setEnabled}
          note={enabled
            ? (meta.ready
              ? "On, and ready. Paid orders are invoiced."
              : "On, but nothing is issued until everything above is filled in.")
            : "Off. Nothing is generated; an uploaded invoice still works as it always did."}
        >
          {label("invoice_enabled").label}
        </SettingSwitch>
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : "Save tax and invoicing"}
        </Button>
      </FormActions>
    </Form>
  );
}
