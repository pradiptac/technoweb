import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Alert } from "@/components/ui/input";
import { getCart } from "@/lib/cart";
import { getCurrentCustomer } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { settingEnabled } from "@/lib/site-settings";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { CheckoutForm } from "./checkout-form";

/** One person's basket, priced at this instant. Nothing here may be cached. */
export const dynamic = "force-dynamic";

export const metadata = buildMetadata({ title: "Checkout", path: "/checkout", seo: noIndex });

export default async function CheckoutPage() {
  const cart = await getCart();

  // An empty basket has nothing to check out. Sending somebody back to the
  // shop is a better answer than an empty form asking for their address.
  if (!cart || cart.items.length === 0) redirect("/cart");

  const settings = await getSiteSettings();

  /*
   * Prefill from the account when there is one, and never require one.
   *
   * Guest checkout is a requirement, so this is the whole of what being signed
   * in buys here: the form opens filled in. A failure to read the session is
   * not a failure to check out — `getCurrentCustomer` already answers null for
   * a 401, and anything worse falls back to the same empty form.
   */
  const customer = await getCurrentCustomer().catch(() => null);

  return (
    <>
      <PageHero
        kicker="Store"
        title="Checkout"
        crumbs={[
          { name: "Store", path: "/store" },
          { name: "Basket", path: "/cart" },
          { name: "Checkout", path: "/checkout" },
        ]}
      />

      <section className="section-y">
        <Container>
          {/*
            Said before the form rather than after the order.

            `store_payments_ready` is derived on the server from whether a
            gateway is chosen *and* this install has its keys — so a shop that
            is not finished says so here, where somebody can still telephone,
            instead of at the moment they press Pay.
          */}
          {!settingEnabled(settings, "store_payments_ready") && (
            <Alert tone="warn" title="Online payment is not available yet" dismissible={false}>
              You can still place the order and we will contact you to arrange payment.
            </Alert>
          )}

          <CheckoutForm cart={cart} shippable={cart.has_shippable} customer={customer} />
        </Container>
      </section>
    </>
  );
}
