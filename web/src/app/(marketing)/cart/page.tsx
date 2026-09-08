import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Alert } from "@/components/ui/input";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
// IconBox stays for the line thumbnails — a missing *product* picture is a
// box; the empty basket is a basket.
import { IconBox, IconCart, IconTrash } from "@/components/icons";
import { getCart } from "@/lib/cart";
import { formatPaise } from "@/lib/money";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { clearCartAction, removeCartLineAction, updateCartLineAction } from "../store/actions";
import { QuantityField } from "@/components/store/quantity-field";
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
            <EmptyState icon={<IconCart />} title="Your basket is empty">
              <span className="block">
                Nothing in here yet. <Link className="underline" href="/store">Have a look at the store</Link>.
              </span>
            </EmptyState>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
              {/*
                `min-w-0`, because a grid item's automatic minimum size is its
                min-content rather than zero — so one long product name or part
                number in a line below sizes this whole column and pushes the
                page 42px sideways at 360. Nothing looks over the edge and every
                child fits its own box; it is the track that is too wide. The
                campaign editor's block list and the store dashboard's panels
                have both been fixed for exactly this.
              */}
              <div className="min-w-0">
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
                  {/*
                    `items-center` on each row: its height is set by whichever
                    of the three columns is tallest — usually the price stack
                    on the right — and left to stretch, the product name sat
                    pinned to the top with empty space under it. Centred, the
                    name lines up with the picture it belongs to, which is what
                    the eye pairs them by.

                    The comment sits here rather than inside the callback: a
                    `.map()` that returns one element cannot also be handed a
                    comment, which reads as "JSX expressions must have one
                    parent element" and has caught this project before.
                  */}
                  {items.map((line) => (
                    <li key={line.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-line-strong bg-card p-4">
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

                      <div className="flex items-center gap-4">
                        {/*
                          Still a plain form per line, so the quantity works
                          with no JavaScript at all — which is what a shop
                          should do, and is free here because the action is a
                          server one.

                          `QuantityField` saves on change once scripts are
                          running, and hides its own Update button when it
                          does. Deleting that button outright to save a click
                          would have quietly taken the no-JS path with it.
                        */}
                        <form action={updateCartLineAction}>
                          <input type="hidden" name="id" value={line.id} />
                          <QuantityField id={line.id} name={line.name} quantity={line.quantity} />
                        </form>

                        <div className="text-right">
                          <p className="text-[15px] font-semibold tabular-nums">
                            {formatPaise(line.line_total_paise)}
                          </p>
                          <p className="text-[12px] text-faint tabular-nums">
                            {formatPaise(line.unit_price_paise)} each
                          </p>
                          {/*
                            An icon rather than the word, and still a form
                            rather than a client action — unlike the basket
                            preview's copy of this, which cannot be a form
                            because it renders inside the shop's filter form
                            and a nested one is dropped by the browser. There
                            is no outer form here, so the no-JS path is free.

                            `text-err`, not `text-err-fill`: this is coloured
                            text on a panel, which is the first of the two jobs
                            that token has. 24px, which is the floor the audit
                            enforces, with the glyph at 15px inside it — the
                            box is the tap target, not the drawing.
                          */}
                          <form action={removeCartLineAction} className="mt-1 flex justify-end">
                            <input type="hidden" name="id" value={line.id} />
                            <button
                              type="submit"
                              aria-label={`Remove ${line.name} from the basket`}
                              title="Remove"
                              className="grid size-6 place-items-center rounded text-err transition-colors hover:bg-err-soft"
                            >
                              <IconTrash className="size-[15px]" />
                            </button>
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

              <aside className="min-w-0 rounded-lg border border-line-strong bg-card p-5 lg:sticky lg:top-24">
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
