"use client";

import { useActionState, useEffect, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/input";
import { requestStockNoticeAction, type StockNoticeState } from "@/components/store/actions";

const initial: StockNoticeState = {};

/**
 * "Email me when this is back" — drawn under the Add to basket button while
 * the product, or the configuration somebody chose, is out of stock and not
 * back-ordered. `AddToBasket` decides when, because it holds the choice;
 * this only asks for an address.
 *
 * **Prefilled after mount, never during render.** The product page is
 * served whole from the ISR cache, so it cannot read who is signed in; the
 * form asks `/api/store/me` once it is on screen and fills the address in
 * if the field is still empty — a fetch late for a signed-in customer, and
 * nothing at all for everybody else, which is the trade that keeps the page
 * cacheable. The action reads the portal cookie itself, so the account is
 * stamped on the notice whether or not the prefill arrived.
 *
 * `<Form>` with `state`, like every form in the product: a refused submit
 * puts what was typed back. The honeypot is `website`, the field name every
 * public form here uses.
 */
export function StockNoticeForm({ slug, variationId }: { slug: string; variationId?: number | null }) {
  const [state, formAction, pending] = useActionState(requestStockNoticeAction, initial);
  const [email, setEmail] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (prefilled) return;

    let cancelled = false;

    fetch("/api/store/me", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(async (res) => {
        if (res.status !== 200) return null;
        return ((await res.json()) as { data?: { email?: string } }).data?.email ?? null;
      })
      .then((found) => {
        if (cancelled || !found) return;
        setPrefilled(true);
        setEmail((current) => current || found);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [prefilled]);

  if (state.ok) {
    return (
      <Alert tone="ok" title="We'll email you when it's back." dismissible={false}>
        One message, when it is in stock again. Nothing else.
      </Alert>
    );
  }

  return (
    <Form action={formAction} state={state} className="relative grid gap-2 rounded-lg border border-line bg-surface p-4">
      <input type="hidden" name="slug" value={slug} />
      {variationId ? <input type="hidden" name="variation_id" value={variationId} /> : null}
      {/* The honeypot, off-screen the way the comment form's is: a person and a keyboard never meet it. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="stock-notice-website">Website</label>
        <input id="stock-notice-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <p className="text-13-5 font-semibold text-ink">Email me when it is back</p>
      <p className="text-12-5 text-muted">
        One message when it is in stock again, and a link to cancel in it.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Email address" htmlFor="stock-notice-email" className="mb-0 min-w-0 flex-1" error={state.error}>
          <Input
            id="stock-notice-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Button type="submit" size="sm" pending={pending}>
          {pending ? "Saving…" : "Notify me"}
        </Button>
      </div>
    </Form>
  );
}
