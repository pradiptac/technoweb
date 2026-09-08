/**
 * The category segment.
 *
 * It used to render `BasketBar` here, above every category page. That strip is
 * gone: the page itself now carries `StoreFilterBar` under its banner, which
 * holds the same `BasketIndicator` **and** a search box the old row never had —
 * so somebody inside a category can look for a part number without going back
 * to the shop's front page for one.
 *
 * The bar has to be on the page rather than in this layout because it belongs
 * *under* the hero banner, and a layout can only wrap what a page renders.
 *
 * **A new page under this segment must render `StoreFilterBar` itself.** That
 * is the cost of the move and it is written down rather than left to be
 * discovered: the basket has to be reachable from wherever somebody is
 * shopping, and a page that quietly renders without it is a shop with no way
 * back to the checkout. `/store/products/*` still gets `BasketBar` from its own
 * layout, which is the other half of the shop and unchanged.
 */
export default function StoreCategoriesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
