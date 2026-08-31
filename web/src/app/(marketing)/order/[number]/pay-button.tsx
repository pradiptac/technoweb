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

  return (
    <div className="grid gap-3">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

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
