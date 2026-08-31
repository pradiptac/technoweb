import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Alert } from "@/components/ui/input";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { IconBox } from "@/components/icons";
import { getCart } from "@/lib/cart";
import { formatPaise } from "@/lib/money";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { clearCartAction, removeCartLineAction, updateCartLineAction } from "../store/actions";
import { CouponField } from "./coupon-field";

/**
 * `noindex`, and dynamic.
 *
 * A basket is one person's and changes on every action, so there is nothing
 * here to cache and nothing a search engine should ever hold. Reading the cart
 * touches a cookie, which makes the route dynamic regardless — this states it
 * rather than leaving it to be inferred.
 */
export const dynamic = "force-dynamic";

export const metadata = buildMetadata({ title: "Your basket", path: "/cart", seo: noIndex });

export default async function CartPage() {
  const cart = await getCart();
  const items = cart?.items ?? [];

  return (
    <>
      <PageHero
        kicker="Store"
        title="Your basket"
        crumbs={[{ name: "Store", path: "/store" }, { name: "Basket", path: "/cart" }]}
      />

      <section className="section-y">
        <Container>
          {items.length === 0 ? (
            <EmptyState icon={<IconBox />} title="Your basket is empty">
              <span className="block">
                Nothing in here yet. <Link className="underline" href="/store">Have a look at the store</Link>.
              </span>
            </EmptyState>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
              <div>
                {/*
                  Every problem the server found, said before the total rather
                  than after it. Silently dropping a sold-out line would mean
                  reaching the payment page with a different basket from the one
                  that was built, and the first sign of it would be the figure.
                */}
                {cart!.problems.length > 0 && (
                  <Alert tone="warn" title="Check these before you pay" dismissible={false}>
                    <ul className="ml-4 list-disc">
                      {cart!.problems.map((p) => <li key={p}>{p}</li>)}
                    </ul>
                  </Alert>
                )}

                <ul className="grid gap-3">
                  {items.map((line) => (
                    <li key={line.id} className="flex flex-wrap gap-4 rounded-lg border border-line-strong bg-card p-4">
                      <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded border border-line bg-surface p-2">
                        {line.image_url
                          ? <Image src={line.image_url} alt="" width={80} height={80} className="max-h-full w-auto object-contain" unoptimized />
                          : <span className="text-faint"><IconBox /></span>}
                      </span>

                      <div className="min-w-0 flex-1">
                        <h2 className="text-[15px] font-semibold">
                          <Link href={`/store/products/${line.slug}`} className="hover:underline">
                            {line.name}
                          </Link>
                        </h2>
                        {line.variation_name && (
                          <p className="text-[13px] text-muted">{line.variation_name}</p>
                        )}
                        {line.sku && <p className="font-mono text-[12px] text-faint">{line.sku}</p>}
                        {!line.returnable && (
                          <p className="mt-1 text-[12.5px] font-medium text-warn">Non-returnable</p>
                        )}
                        {line.problem && (
                          <p className="mt-1 text-[12.5px] font-medium text-err">{line.problem}</p>
                        )}
                      </div>

                      <div className="flex items-start gap-4">
                        {/*
                          A plain form per line, so the quantity works with no
                          JavaScript at all — which is what a shop should do,
                          and is free here because the action is a server one.
                        */}
                        <form action={updateCartLineAction} className="flex items-center gap-1.5">
                          <input type="hidden" name="id" value={line.id} />
                          <label htmlFor={`qty-${line.id}`} className="sr-only">
                            Quantity of {line.name}
                          </label>
                          <input
                            id={`qty-${line.id}`}
                            name="quantity"
                            type="number"
                            min={0}
                            max={99}
                            defaultValue={line.quantity}
                            className="w-16 rounded border border-line-strong bg-surface px-2 py-1.5 text-[14px]"
                          />
                          <Button type="submit" size="sm" variant="secondary">Update</Button>
                        </form>

                        <div className="text-right">
                          <p className="text-[15px] font-semibold tabular-nums">
                            {formatPaise(line.line_total_paise)}
                          </p>
                          <p className="text-[12px] text-faint tabular-nums">
                            {formatPaise(line.unit_price_paise)} each
                          </p>
                          <form action={removeCartLineAction}>
                            <input type="hidden" name="id" value={line.id} />
                            <Button type="submit" size="sm" variant="ghost" className="text-err">Remove</Button>
                          </form>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <form action={clearCartAction} className="mt-4">
                  <Button type="submit" size="sm" variant="ghost">Empty the basket</Button>
                </form>
              </div>

              <aside className="rounded-lg border border-line-strong bg-card p-5 lg:sticky lg:top-24">
                <h2 className="mb-4 text-[15px] font-semibold">Summary</h2>

                <dl className="grid gap-2 text-[14px]">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Subtotal</dt>
                    <dd className="tabular-nums">{formatPaise(cart!.subtotal_paise)}</dd>
                  </div>

                  {cart!.discount_paise > 0 && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted">Discount</dt>
                      <dd className="tabular-nums text-ok">−{formatPaise(cart!.discount_paise)}</dd>
                    </div>
                  )}

                  <div className="flex justify-between gap-4 border-t border-line pt-2 text-[17px] font-semibold">
                    <dt>Total</dt>
                    <dd className="tabular-nums">{formatPaise(cart!.total_paise)}</dd>
                  </div>

                  {/*
                    The GST is shown as part of the total, never added to it.
                    Prices include it, so this is a breakdown of what is already
                    there — which is what the law wants stated and what stops
                    somebody expecting another 18% at the payment page.
                  */}
                  <div className="flex justify-between gap-4 text-[12.5px] text-muted">
                    <dt>Includes GST at {cart!.gst_rate}</dt>
                    <dd className="tabular-nums">{formatPaise(cart!.gst_paise)}</dd>
                  </div>
                </dl>

                <CouponField applied={cart!.coupon_code} label={cart!.coupon_label} />

                <div className="mt-5 grid gap-2">
                  <ButtonLink href="/checkout" className="w-full justify-center">
                    Checkout
                  </ButtonLink>
                  <Link href="/store" className="text-center text-[13.5px] font-medium text-muted hover:text-ink">
                    Keep shopping
                  </Link>
                </div>

                {cart!.has_shippable && (
                  <p className="mt-4 text-[12.5px] text-muted">
                    Delivery is arranged after the order is placed — we enter the courier and
                    tracking number, and you can follow it from your account.
                  </p>
                )}
              </aside>
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
