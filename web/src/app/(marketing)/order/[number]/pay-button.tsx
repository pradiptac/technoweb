"use client";

import Script from "next/script";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { formatPaise } from "@/lib/money";
import { openPaymentAction, confirmPaymentAction } from "./actions";
import type { PaymentSession } from "@/types/api";

/**
 * The payment step.
 *
 * Two gateways, one button (Cashfree since 2026-09-18). The session the API
 * opens says which, and the branch below is the whole of the difference on
 * this side: Razorpay's `checkout.js` takes an options object and hands back
 * a signed triple; Cashfree's SDK v3 takes a `paymentSessionId`, opens its
 * own modal, and resolves with nothing worth trusting -- so the confirm
 * step posts only the order number and the API asks Cashfree itself. Both
 * scripts are loaded `lazyOnload`; each is allowed by name in the CSP.
 *
 * Razorpay's dialog is their script and their iframe, opened from the browser
 * — there is no server-rendered version of it. What this component must get
 * right is everything around that:
 *
 * **It never decides anything.** The dialog hands back three strings, they go
 * straight to the server, and the server checks the signature against a secret
 * this page has never had. Rendering "paid" because the dialog said so would be
 * the single most common way a shop is robbed.
 *
 * **It never says "you were not charged".** If confirmation fails, the money
 * may well have left — the webhook settles the order either way. So the wording
 * is about what *this page* knows, not about somebody's bank account.
 *
 * The script is loaded `lazyOnload` and only on this screen. Somebody browsing
 * the shop has no need of a payment library, and the CSP names the host exactly
 * rather than allowing a wildcard on a payment provider's domain.
 */
export function PayButton({
  orderNumber, token, totalPaise,
}: {
  orderNumber: string;
  /** The order's access token — already in this page's URL, so no secret is
   *  being newly exposed by handing it to the button that uses it. */
  token: string;
  totalPaise: number;
}) {
  const [state, setState] = useState<"idle" | "opening" | "open" | "confirming" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const pay = async () => {
    setState("opening");
    setMessage(null);

    const session = await openPaymentAction(orderNumber, token);

    if ("error" in session) {
      setState("failed");
      setMessage(session.error);

      return;
    }

    if ((session as PaymentSession).gateway === "cashfree") {
      await payWithCashfree(session as PaymentSession);

      return;
    }

    const razorpay = (window as unknown as { Razorpay?: new (options: unknown) => { open: () => void } }).Razorpay;

    if (!razorpay) {
      setState("failed");
      // The honest message. A blocked script is not a declined card, and
      // telling somebody their payment failed would send them to their bank.
      setMessage("The payment window could not load. Check that your browser is not blocking scripts, and try again.");

      return;
    }

    setState("open");

    const options: Record<string, unknown> = {
      key: (session as PaymentSession).key_id,
      order_id: (session as PaymentSession).gateway_order_id,
      // Paise, which is what the API stores and sends. No conversion here, and
      // therefore no rounding.
      amount: (session as PaymentSession).amount_paise,
      currency: (session as PaymentSession).currency,
      name: (session as PaymentSession).name,
      description: `Order ${orderNumber}`,
      prefill: (session as PaymentSession).prefill ?? {},
      handler: async (response: Record<string, string>) => {
        setState("confirming");

        const result = await confirmPaymentAction(orderNumber, token, response);

        if (result.error) {
          setState("failed");
          setMessage(result.error);

          return;
        }

        // The server has confirmed it. Reload so the page renders the paid
        // order from the server rather than from anything decided here.
        window.location.reload();
      },
      modal: {
        ondismiss: () => {
          setState("idle");
          setMessage("Payment was not completed. Nothing has been charged — you can try again.");
        },
      },
    };

    new razorpay(options).open();
  };

  const payWithCashfree = async (session: PaymentSession) => {
    const factory = (window as unknown as { Cashfree?: (o: { mode: string }) => CashfreeSdk }).Cashfree;

    if (!factory || !session.payment_session_id) {
      setState("failed");
      setMessage("The payment window could not load. Check that your browser is not blocking scripts, and try again.");

      return;
    }

    setState("open");
    // `_modal` keeps the page under the checkout, so the confirm step below
    // runs here rather than on a return URL; the return URL the API set on
    // the order is what a redirecting method (net banking) comes back to.
    const result = await factory({ mode: session.mode ?? "sandbox" }).checkout({
      paymentSessionId: session.payment_session_id,
      redirectTarget: "_modal",
    });

    if (result.error) {
      setState("idle");
      setMessage("Payment was not completed. Nothing has been charged — you can try again.");

      return;
    }

    setState("confirming");
    // Nothing the SDK resolved with is trusted: the API asks Cashfree whether
    // this order has a successful payment, with the secret the browser never had.
    const confirmed = await confirmPaymentAction(orderNumber, token, { gateway: "cashfree" });

    if (confirmed.error) {
      setState("failed");
      setMessage(confirmed.error);

      return;
    }

    window.location.reload();
  };

  return (
    <div className="grid gap-3">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <Script src="https://sdk.cashfree.com/js/v3/cashfree.js" strategy="lazyOnload" />

      <Button
        type="button"
        onClick={pay}
        disabled={state === "opening" || state === "open" || state === "confirming"}
        className="w-full justify-center sm:w-auto"
      >
        {state === "opening" ? "Opening…"
          : state === "confirming" ? "Confirming…"
          : `Pay ${formatPaise(totalPaise)}`}
      </Button>

      {message && (
        <Alert tone={state === "failed" ? "err" : "info"} title={state === "failed" ? "Not confirmed" : "Not completed"}>
          {message}
        </Alert>
      )}
    </div>
  );
}

/** The corner of Cashfree's SDK v3 this button uses. */
type CashfreeSdk = {
  checkout: (o: { paymentSessionId: string; redirectTarget: "_modal" | "_self" | "_blank" }) => Promise<{
    error?: { message?: string };
    redirect?: boolean;
    paymentDetails?: { paymentMessage?: string };
  }>;
};
