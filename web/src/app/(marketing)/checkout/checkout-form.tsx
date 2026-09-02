"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { PincodeAutofill } from "@/components/forms/pincode-autofill";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/input";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { placeOrderAction, type CheckoutState } from "./actions";
import type { CartSummary } from "@/types/api";

const initial: CheckoutState = {};

/**
 * One page, one form.
 *
 * The brief asks for a single-page checkout and rules out a wizard, and the
 * reason is worth stating: every step is a page somebody can abandon on. What
 * looks like a two-column layout here is one `<Form>` — the summary on the
 * right is not a second step, it is the same page saying what is about to be
 * bought.
 *
 * **Nothing about money is submitted.** No total, no price, no quantity, no
 * product id. The summary is rendered from what the server already said the
 * basket costs, and the order is priced again when it is placed. There is
 * nowhere in this form for a figure to be tampered with, which is the point.
 *
 * ## It is deliberately the densest form in the product
 *
 * A checkout is the one screen where scrolling is abandonment, so this is the
 * one form here that is packed rather than spaced. Four changes did it, and
 * none of them is "make the text smaller":
 *
 * - **Fields that answer one question share a row.** Name with phone, PIN code
 *   with country, state with city — above `sm` only, so a phone still stacks.
 * - **GST is a checkbox, not a card.** It had a bordered section, an `h2` and
 *   a paragraph of explanation to introduce one tick box: 116px of chrome
 *   around 20px of control. It belongs at the foot of Your details on its own
 *   merits, too — every field above says who the order is for, and this says
 *   who the invoice is made out to.
 * - **A hint that restates its label is deleted.** "Phone — in case there is a
 *   problem with the delivery" tells nobody anything, and "Address line 2 —
 *   optional" spends a line on a word that fits in the label.
 * - **Padding, never type size.** The public site has a 12px floor and the
 *   mobile block lifts every control to 16px, so shrinking text here would
 *   either be silently undone by `globals.css` or fail `audit:mobile`. Nothing
 *   on this screen is smaller than it was.
 */
export function CheckoutForm({ cart, shippable }: { cart: CartSummary; shippable: boolean }) {
  const [state, formAction, pending] = useActionState(placeOrderAction, initial);
  const [gst, setGst] = useState(false);

  /*
   * The list comes from the basket, so it is the shop's own answer about what
   * is switched on right now rather than a copy kept on this side of the wire.
   * Empty when the API is older than this screen, which falls back to the
   * gateway — the behaviour before any of this existed.
   */
  const methods = cart.payment_methods ?? [];
  const usable = methods.filter(
    (m) => !(m.max_paise != null && cart.total_paise > m.max_paise) && (m.permits_digital || shippable),
  );
  const [method, setMethod] = useState(usable[0]?.value ?? "gateway");
  const chosen = methods.find((m) => m.value === method);

  const err = (field: string) => state.fieldErrors?.[field]?.[0];

  /** Two fields to a row above `sm`, one below it. */
  const pair = "grid gap-x-4 sm:grid-cols-2";
  const card = "rounded-lg border border-line-strong bg-card p-4 sm:p-5";

  return (
    <Form action={formAction} state={state} noValidate className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-start">
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

        <section className={card}>
          <h2 className="mb-3 text-[15px] font-semibold">Your details</h2>

          <div className={pair}>
            <Field label="Full name" htmlFor="name" error={err("name")}>
              <Input id="name" name="name" autoComplete="name" required aria-invalid={Boolean(err("name"))} />
            </Field>

            <Field label="Phone" htmlFor="phone" error={err("phone")}>
              <Input id="phone" name="phone" type="tel" autoComplete="tel" required
                aria-invalid={Boolean(err("phone"))} />
            </Field>
          </div>

          {/*
            The email keeps its hint and its own row. It is the only field here
            whose value matters *after* the order — it is the link back to it —
            and that is something nobody knows until they are told.
          */}
          <Field label="Email" htmlFor="email" error={err("email")}
            hint="The confirmation goes here, and it is the link back to this order.">
            <Input id="email" name="email" type="email" autoComplete="email" required
              aria-invalid={Boolean(err("email"))} />
          </Field>

          {/*
            The honeypot, matching every other public form here. Hidden from
            people and left alone by them; a bot fills it and the API refuses.
          */}
          <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
            <label htmlFor="website">Website</label>
            <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>

          <label className="flex items-start gap-2.5 border-t border-line pt-3 text-[14px]">
            <input
              type="checkbox"
              name="gst_required"
              value="1"
              checked={gst}
              onChange={(e) => setGst(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]"
            />
            <span>
              I need GST details on my invoice
              <span className="block text-[12.5px] text-muted">
                Only if the invoice should be made out to a business.
              </span>
            </span>
          </label>

          {gst && (
            <div className="mt-3">
              <div className={pair}>
                <Field label="GSTIN" htmlFor="gstin" error={err("gstin")} hint="Like 27AAPFU0939F1ZV.">
                  <Input id="gstin" name="gstin" className="font-mono text-[14px]" maxLength={15}
                    aria-invalid={Boolean(err("gstin"))} />
                </Field>

                <Field label="Business name" htmlFor="company_name" error={err("company_name")}>
                  <Input id="company_name" name="company_name" autoComplete="organization" />
                </Field>
              </div>

              {/*
                Said before somebody expects an automatic download. The invoice
                is prepared by hand and sent afterwards, which is the brief's
                own arrangement and not a limitation to hide.
              */}
              <p className="measure text-[12.5px] text-muted">
                We prepare the GST invoice by hand and email it after the order is confirmed.
              </p>
            </div>
          )}
        </section>

        {/*
          The address is asked for only when something is being shipped. A
          licence has nowhere to be delivered to, and a form that demands a PIN
          code to sell one is a form arguing with itself.
        */}
        {shippable && (
          <section className={cn(card, "mt-3")}>
            <h2 className="mb-3 text-[15px] font-semibold">Delivery address</h2>

            {/*
              The PIN code is asked for first, and the three fields under it
              fill themselves from it.

              Not the conventional order — street, then town, then post code —
              and deliberately so. Six digits determine the state and very
              nearly determine the town, so asking for them first turns three
              fields somebody would otherwise get wrong, abbreviate, or spell
              six ways into three they only have to glance at. The street is
              the one part a PIN code cannot know, so it is asked for last.

              Every one of them stays editable, which is not a nicety: 1,229
              PIN codes straddle a district boundary, and district is not the
              same word as city — 700091 is "North 24 Parganas" to India Post
              and "Kolkata" to everybody who lives there.

              PIN code shares its row with country so that the status line sits
              directly beneath both: the field that does the filling and the
              sentence saying what it filled stay next to each other.
            */}
            <div className={pair}>
              <Field label="PIN code" htmlFor="pin" error={err("address.pin")}
                hint="Six digits. The rest fills in from it.">
                <Input id="pin" name="pin" inputMode="numeric" autoComplete="postal-code"
                  maxLength={6} required aria-invalid={Boolean(err("address.pin"))} />
              </Field>

              <Field label="Country" htmlFor="country">
                <Input id="country" name="country" defaultValue="India" autoComplete="country-name" />
              </Field>
            </div>

            <PincodeAutofill />

            <div className={pair}>
              <Field label="State" htmlFor="state" error={err("address.state")}>
                <Input id="state" name="state" autoComplete="address-level1" required
                  aria-invalid={Boolean(err("address.state"))} />
              </Field>

              <Field label="City" htmlFor="city" error={err("address.city")}>
                <Input id="city" name="city" autoComplete="address-level2" required
                  aria-invalid={Boolean(err("address.city"))} />
              </Field>
            </div>

            <Field label="Address" htmlFor="line1" error={err("address.line1")}>
              <Input id="line1" name="line1" autoComplete="address-line1" required
                aria-invalid={Boolean(err("address.line1"))} />
            </Field>

            {/* "Optional" belongs in the label; as a hint it is a line for one word. */}
            <Field label="Address line 2 (optional)" htmlFor="line2">
              <Input id="line2" name="line2" autoComplete="address-line2" />
            </Field>
          </section>
        )}
      </div>

      <aside className={cn(card, "lg:sticky lg:top-24")}>
        <h2 className="mb-3 text-[15px] font-semibold">Your order</h2>

        <ul className="grid gap-2 border-b border-line pb-3">
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

        <dl className="grid gap-1.5 py-3 text-[14px]">
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

        {/*
          How to pay, chosen before the order is placed rather than after.

          It has to be here because it changes what happens next: a gateway order
          goes to a payment page, cash on delivery is confirmed on the spot, and
          a transfer shows instructions. Asking afterwards would mean an order
          already exists in a state nobody chose.

          Rendered only when the shop offers more than one — a single option is
          not a choice, and a radio group of one is a control that asks a
          question with one answer.
        */}
        {methods.length > 1 && (
          <fieldset className="border-t border-line pt-3">
            <legend className="sr-only">How would you like to pay?</legend>
            <p className="mb-2 text-[13px] font-semibold">How would you like to pay?</p>

            <ul className="grid gap-1.5">
              {methods.map((m) => {
                const tooDear = m.max_paise !== null && m.max_paise !== undefined && cart.total_paise > m.max_paise;
                const wrongGoods = !m.permits_digital && !shippable;
                const off = tooDear || wrongGoods;

                return (
                  <li key={m.value}>
                    {/*
                      Disabled with its reason rather than hidden, the rule the
                      mail panel follows for an uninstalled transport: an option
                      that vanishes is a question somebody has to go and ask.

                      `py-2.5` rather than `p-3`: two lines of text keep the row
                      near 50px, well past the 24px the audit enforces and past
                      the 44px a thumb wants.
                    */}
                    <label
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                        off
                          ? "cursor-not-allowed border-line bg-surface-2 opacity-60"
                          : method === m.value
                            ? "border-brand-600 bg-brand-50"
                            : "border-line-strong bg-card hover:border-brand-300",
                      )}
                    >
                      <input
                        type="radio"
                        name="payment_method"
                        value={m.value}
                        checked={method === m.value}
                        disabled={off}
                        onChange={() => setMethod(m.value)}
                        className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium">{m.label}</span>
                        <span className="block text-[12.5px] text-muted">
                          {tooDear
                            ? `Available up to ${formatPaise(m.max_paise!)}. This order is more than that.`
                            : wrongGoods
                              ? "Not available for a licence or a download — there is nothing to hand over."
                              : m.blurb}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {err("payment_method") && (
              <p className="mt-2 text-[12.5px] text-err">{err("payment_method")}</p>
            )}
          </fieldset>
        )}

        <Button type="submit" disabled={pending} className="mt-4 w-full justify-center">
          {pending ? "Placing your order…" : "Place order"}
        </Button>

        <p className="measure mt-2 text-[12.5px] text-muted">
          {chosen?.settles_online === false
            ? "Nothing is charged now. The next screen says how to pay."
            : "You will pay on the next screen. Nothing is charged until you do."}
        </p>
      </aside>
    </Form>
  );
}
