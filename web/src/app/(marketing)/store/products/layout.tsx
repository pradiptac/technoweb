/**
 * The product segment.
 *
 * It used to render `BasketBar` here, above every product page — a strip
 * reading "Store · All prices include 18% GST" with the basket at the far end.
 * That is gone, and the page itself now carries `StoreFilterBar` under its
 * banner: the same `BasketIndicator` plus a search box the old row never had,
 * so somebody looking at one switch can go and find another without going back
 * to the shop's front page for a search field.
 *
 * It had to move for the same reason it moved on the category pages: the bar
 * belongs **under** the hero banner, and a layout can only wrap what a page
 * renders. Leaving one half of the shop on the old strip was the state this
 * finishes — two different bars either side of a link is not a shop, it is two.
 *
 * **A new page under this segment must render `StoreFilterBar` itself.** That
 * is the cost of the move and it is written down rather than left to be
 * discovered: the basket has to be reachable from wherever somebody is
 * shopping, and a page that quietly renders without it is a shop with no way
 * back to the checkout.
 */
export default function StoreProductsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
