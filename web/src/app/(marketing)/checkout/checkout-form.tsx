"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/input";
import { formatPaise } from "@/lib/money";
import { placeOrderAction, type CheckoutState } from "./actions";
import type { CartSummary } from "@/types/api";

const initial: CheckoutState = {};

/**
 * One page, one form.
 *
 * The brief asks for a single-page checkout and rules out a wizard, and the
 * reason is worth stating: every step is a page somebody can abandon on. What
 * looks like a two-column layout here is one `<form>` — the summary on the
 * right is not a second step, it is the same page saying what is about to be
 * bought.
 *
 * **Nothing about money is submitted.** No total, no price, no quantity, no
 * product id. The summary is rendered from what the server already said the
 * basket costs, and the order is priced again when it is placed. There is
 * nowhere in this form for a figure to be tampered with, which is the point.
 */
export function CheckoutForm({ cart, shippable }: { cart: CartSummary; shippable: boolean }) {
  const [state, formAction, pending] = useActionState(placeOrderAction, initial);
  const [gst, setGst] = useState(false);

  const err = (field: string) => state.fieldErrors?.[field]?.[0];

  return (
    <form action={formAction} noValidate className="grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-start">
      <div className="min-w-0">
        {state.error && <Alert tone="err" title="We could not place the order">{state.error}</Alert>}

        {/*
          Every problem the server found with the basket, before the fields
          rather than after them. A basket that cannot be sold as it stands is
          not something to discover after typing an address.
        */}
        {state.fieldErrors?.cart && (
          <Alert tone="warn" title="Check your basket" dismissible={false}>
            <ul className="ml-4 list-disc">
              {state.fieldErrors.cart.map((problem) => <li key={problem}>{problem}</li>)}
            </ul>
          </Alert>
        )}

        <section className="rounded-lg border border-line-strong bg-card p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Your details</h2>

          <Field label="Full name" htmlFor="name" error={err("name")}>
            <Input id="name" name="name" autoComplete="name" required aria-invalid={Boolean(err("name"))} />
          </Field>

          <Field label="Email" htmlFor="email" error={err("email")}
            hint="The order confirmation goes here, and it is the link back to this order.">
            <Input id="email" name="email" type="email" autoComplete="email" required
              aria-invalid={Boolean(err("email"))} />
          </Field>

          <Field label="Phone" htmlFor="phone" error={err("phone")}
            hint="In case there is a problem with the delivery.">
            <Input id="phone" name="phone" type="tel" autoComplete="tel" required
              aria-invalid={Boolean(err("phone"))} />
          </Field>

          {/*
            The honeypot, matching every other public form here. Hidden from
            people and left alone by them; a bot fills it and the API refuses.
          */}
          <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
            <label htmlFor="website">Website</label>
            <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>
        </section>

        {/*
          The address is asked for only when something is being shipped. A
          licence has nowhere to be delivered to, and a form that demands a PIN
          code to sell one is a form arguing with itself.
        */}
        {shippable && (
          <section className="mt-4 rounded-lg border border-line-strong bg-card p-5">
            <h2 className="mb-4 text-[15px] font-semibold">Delivery address</h2>

            <Field label="Address" htmlFor="line1" error={err("address.line1")}>
              <Input id="line1" name="line1" autoComplete="address-line1" required
                aria-invalid={Boolean(err("address.line1"))} />
            </Field>

            <Field label="Address line 2" htmlFor="line2" hint="Optional.">
              <Input id="line2" name="line2" autoComplete="address-line2" />
            </Field>

            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="City" htmlFor="city" error={err("address.city")}>
                <Input id="city" name="city" autoComplete="address-level2" required />
              </Field>

              <Field label="State" htmlFor="state" error={err("address.state")}>
                <Input id="state" name="state" autoComplete="address-level1" required />
              </Field>

              <Field label="PIN code" htmlFor="pin" error={err("address.pin")}>
                <Input id="pin" name="pin" inputMode="numeric" autoComplete="postal-code" required />
              </Field>

              <Field label="Country" htmlFor="country">
                <Input id="country" name="country" defaultValue="India" autoComplete="country-name" readOnly />
              </Field>
            </div>
          </section>
        )}

        <section className="mt-4 rounded-lg border border-line-strong bg-card p-5">
          <h2 className="mb-1 text-[15px] font-semibold">GST details</h2>
          <p className="measure mb-3 text-[13px] text-muted">
            Optional. Only needed if you want the invoice made out to a business.
          </p>

          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              name="gst_required"
              value="1"
              checked={gst}
              onChange={(e) => setGst(e.target.checked)}
            />
            I need GST details on my invoice
          </label>

          {gst && (
            <div className="mt-4">
              <Field label="GSTIN" htmlFor="gstin" error={err("gstin")}
                hint="Fifteen characters, like 27AAPFU0939F1ZV.">
                <Input id="gstin" name="gstin" className="font-mono text-[14px]" maxLength={15}
                  aria-invalid={Boolean(err("gstin"))} />
              </Field>

              <Field label="Business name" htmlFor="company_name" error={err("company_name")}>
                <Input id="company_name" name="company_name" autoComplete="organization" />
              </Field>

              {/*
                Said before somebody expects an automatic download. The invoice
                is prepared by hand and sent afterwards, which is the brief's
                own arrangement and not a limitation to hide.
              */}
              <p className="measure text-[12.5px] text-muted">
                We prepare the GST invoice by hand and email it to you after the order is
                confirmed. It is not generated automatically.
              </p>
            </div>
          )}
        </section>
      </div>

      <aside className="rounded-lg border border-line-strong bg-card p-5 lg:sticky lg:top-24">
        <h2 className="mb-4 text-[15px] font-semibold">Your order</h2>

        <ul className="grid gap-2.5 border-b border-line pb-4">
          {cart.items.map((line) => (
            <li key={line.id} className="flex gap-3 text-[13.5px]">
              <span className="min-w-0 flex-1">
                {line.name}
                {line.variation_name && <span className="block text-[12.5px] text-muted">{line.variation_name}</span>}
                <span className="block text-[12.5px] text-faint">× {line.quantity}</span>
                {!line.returnable && (
                  <span className="block text-[12px] font-medium text-warn">Non-returnable</span>
                )}
              </span>
              <span className="tabular-nums">{formatPaise(line.line_total_paise)}</span>
            </li>
          ))}
        </ul>

        <dl className="grid gap-2 py-4 text-[14px]">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular-nums">{formatPaise(cart.subtotal_paise)}</dd>
          </div>

          {cart.discount_paise > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Discount</dt>
              <dd className="tabular-nums text-ok">−{formatPaise(cart.discount_paise)}</dd>
            </div>
          )}

          <div className="flex justify-between gap-4 border-t border-line pt-2 text-[17px] font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPaise(cart.total_paise)}</dd>
          </div>

          <div className="flex justify-between gap-4 text-[12.5px] text-muted">
            <dt>Includes GST at {cart.gst_rate}</dt>
            <dd className="tabular-nums">{formatPaise(cart.gst_paise)}</dd>
          </div>
        </dl>

        <Button type="submit" disabled={pending} className="w-full justify-center">
          {pending ? "Placing your order…" : "Place order"}
        </Button>

        <p className="measure mt-3 text-[12.5px] text-muted">
          You will pay on the next screen. Nothing is charged until you do.
        </p>
      </aside>
    </form>
  );
}
