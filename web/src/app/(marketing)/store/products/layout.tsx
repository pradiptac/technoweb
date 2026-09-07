import { BasketBar } from "@/components/store/basket-bar";

/**
 * The shop's strip, above the product pages.
 *
 * It sits here rather than on `/store`'s own layout because the front page
 * puts the basket at the end of its filter bar instead — one row of controls,
 * the way the design has it, rather than a strip of chrome stacked on top of
 * one. Everywhere else in the shop still gets the strip, and the basket itself
 * is the same `BasketIndicator` in both.
 *
 * **A new page under /store needs one of these.** That is the cost of the
 * split and it is written down rather than left to be discovered: the basket
 * has to be reachable from wherever somebody is shopping, and a page that
 * quietly renders without it is a shop with no way back to the checkout.
 */
export default function StoreProductsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BasketBar />
      {children}
    </>
  );
}
