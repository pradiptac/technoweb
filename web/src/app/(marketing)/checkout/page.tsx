import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Alert } from "@/components/ui/input";
import { getCart } from "@/lib/cart";
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

          <CheckoutForm cart={cart} shippable={cart.has_shippable} />
        </Container>
      </section>
    </>
  );
}
