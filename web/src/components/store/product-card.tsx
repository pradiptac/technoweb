import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { BorderBeam } from "@/components/velora/border-beam";
import { IconBox } from "@/components/icons";
import { formatPaise, percentOff } from "@/lib/money";
import { isNewProduct } from "@/lib/store-product";
import { CardImages } from "@/components/store/card-images";
import { QuickAdd } from "@/components/store/quick-add";
import { QuickView } from "@/components/store/quick-view";
import { WishlistHeart } from "@/components/store/wishlist-heart";
import { RatingPill } from "@/components/store/rating-pill";
import type { StoreProduct } from "@/types/api";

/**
 * One line in the shop.
 *
 * The price is the price paid — GST is already in it, which the listing says
 * once rather than on every card. Three things are always visible because all
 * three are terms of the sale and the buyer should not have to open the page to
 * find them: what it costs, whether it can be had, and whether it can be sent
 * back.
 *
 * Themed by attribute: the card is `data-card data-tile` with the
 * collection's parts on it (`data-tile-media`, `-body`, `-kicker`, `-title`,
 * `-summary`, `-meta` for the price row, `-actions`), so every theme's idiom
 * — `components/ui/collection.tsx` — draws the shop the way it draws the
 * rest of the site. Until 2026-09-18 nothing in the shop said what it was,
 * and `/store` was the one page that looked the same under all twelve.
 */
export function StoreProductCard({
  product, headingLevel = 3, priority = false,
}: {
  product: StoreProduct;
  /**
   * A card under a section heading is an h3; a card in a listing whose h1 is
   * the page title is an h2. Getting this wrong is a heading-level jump, which
   * the audit fails on.
   */
  headingLevel?: 2 | 3;
  /**
   * Set on the first card of the grid that leads the page. Every image here is
   * lazy by default, which is right for a long listing and wrong for whichever
   * one turns out to be the Largest Contentful Paint — Next reports that as a
   * warning and the audit fails on it.
   */
  priority?: boolean;
}) {
  const Heading = `h${headingLevel}` as "h2" | "h3";
  const discounted = Boolean(product.compare_at_paise && product.compare_at_paise > product.price_paise);
  const isNew = isNewProduct(product.created_at);

  /*
    `h-full`: the grid stretches the `li`, but the card inside it was sized by
    its own content — so a two-line product name made one card in the row
    taller than its neighbours and the Add buttons sat on three different
    baselines. With the card filling the cell, `mt-auto` on the price row
    pushes the footer down and every button in the row lines up.
  */
  return (
    <article data-card data-tile data-tile-kind="product" className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-line-strong">
      {/* Staggered off the id so neighbours are not in lockstep — no index to thread through three call sites. */}
      <BorderBeam ring={2} size={120} delay={(product.id % 4) * 1.5} />
      <div data-tile-media className="relative">
        <Link href={`/store/products/${product.slug}`} className="block">
          {/*
            A fixed-ratio well, so a slow image cannot move the price out from
            under somebody's cursor — the rule every image on this site follows.

            4:3, and the same 4:3 on every card in the shop. A ratio rather
            than a fixed height is what makes it hold at any column width — the
            grid runs from two columns on a phone to six on a wide screen, and
            a fixed 176px band was a 1.76:1 letterbox at one of those widths and
            a squat strip at the others. The compact card on a category page
            uses the identical ratio, so a product does not change shape when
            somebody moves between the two listings.

            `CardImages` draws the picture and, while the card is hovered,
            walks through the product's other views — see its note.
          */}
          <div className="relative grid aspect-[4/3] place-items-center overflow-hidden border-b border-line bg-surface">
            {product.images?.[0] ? (
              /*
                `fill` + `object-cover`, so the picture fills the whole well
                rather than sitting inside it. It was `object-contain` in a
                padded box, which is the safe choice for a catalogue of cut-out
                product shots on white and the wrong one here: most of this
                catalogue is photography, and a contained photograph is a small
                rectangle adrift in a grey frame with the card's own border
                drawn twice around it.

                The cost is honest and worth stating: cover crops. The well is a
                fixed 4:3 on every card, so a portrait photograph loses its top
                and bottom — which is why the admin's own hint asks for a
                landscape image.
              */
              <CardImages
                images={product.images}
                alts={product.image_alts}
                focuses={product.image_focuses}
                /*
                  Six columns inside a 90vw container is 15vw a card, so 16vw
                  carries a little margin — it was 20vw for the five-column grid
                  this replaced. Live now that the optimiser is on: this is
                  what picks the srcset candidate, so a card never downloads
                  the 2560px original to paint 250px.
                */
                sizes="(min-width: 1280px) 16vw, (min-width: 640px) 33vw, 50vw"
                priority={priority}
              />
            ) : (
              <span className="text-faint"><IconBox /></span>
            )}
          </div>
        </Link>

        {/*
          Siblings of the Link, not children of it — a corner ribbon or a
          quick-view trigger inside the anchor would either be unreachable by
          keyboard (a span) or invalid HTML (a button inside an <a>).
        */}
        {/*
          One badge, not a stack. A discounted product that is also new used to
          show both, which is two competing claims in the corner of a picture
          and neither read as the headline. "Sale" wins because it is the one
          that changes what somebody pays; the saving itself is stated beside
          the price, where the number it applies to is.
        */}
        {(discounted || isNew) && (
          <span
            className={`absolute left-2.5 top-2.5 z-10 rounded px-2 py-0.5 text-11 font-semibold ${
              discounted ? "bg-err-fill text-white" : "bg-accent-600 text-accent-on"
            }`}
          >
            {discounted ? "Sale" : "New"}
          </span>
        )}

        {/*
          Save it for later, in the corner opposite the badge — a sibling of
          the picture's link for the reason the badge is, since a button inside
          an anchor is invalid. A client island: the card is cached with an
          empty heart and the list fills it after mount.
        */}
        <WishlistHeart productId={product.id} name={product.name} className="absolute right-2.5 top-2.5 z-10" />
        <RatingPill rating={product.rating} />
      </div>

      <div data-tile-body className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        {/*
          One step smaller below `sm`, because the phone grid is two columns
          (2026-09-23, the client's ask).

          The card was written for one column on a phone and six on a wide
          screen, and its type was set for the wide end — a 16px title and a
          20px price in a 170px cell wrap the name to three lines and make the
          price the loudest thing on the screen. Every size here steps down by
          one rung below `sm` and goes back to what it was above it: the grid
          is the only thing that changed, so the type follows the grid rather
          than the other way round. Nothing goes under 12px, which is the floor
          `globals.css` enforces for the public site anyway.
        */}
        <div data-tile-kicker className="flex flex-wrap items-start gap-2">
          {product.brand && (
            <span className="text-12 font-semibold uppercase tracking-[.05em] text-muted sm:text-12-5">
              {product.brand.name}
            </span>
          )}
          {!product.in_stock && <Badge tone="urgent">Out of stock</Badge>}
        </div>

        <Heading data-tile-title className="text-14 font-semibold leading-snug sm:text-[16px]">
          <Link href={`/store/products/${product.slug}`} className="hover:underline">
            {product.name}
          </Link>
        </Heading>

        {product.short_description && (
          <p data-tile-summary className="line-clamp-2 text-12-5 text-muted sm:text-13">{product.short_description}</p>
        )}

        <div data-tile-meta data-tile-price className="mt-auto flex flex-wrap items-baseline gap-2 pt-1">
          <span className="text-17 font-semibold tabular-nums sm:text-[20px]">{formatPaise(product.price_paise)}</span>
          {discounted && (
            <>
              <span className="text-13 tabular-nums text-faint line-through">
                {formatPaise(product.compare_at_paise!)}
              </span>
              {/*
                The saving as its own figure, beside the price it applies to.
                `ok`, not `err`: a discount is good news to the reader, and the
                red is already spent on the corner badge — the same colour
                saying two different things in one card is one too many.
              */}
              <span className="rounded-full bg-ok-soft px-2 py-0.5 text-11-5 font-semibold text-ok">
                {percentOff(product.price_paise, product.compare_at_paise!)}% OFF
              </span>
            </>
          )}
        </div>

        {/*
          Add and quick-view side by side, the way the two controls sit on any
          shop's card: the primary action takes the room and the secondary one
          is a square beside it. The eye used to float over the top-right of
          the photograph, where it covered the product and was easy to press by
          accident while reaching for the picture.
        */}
        <div data-tile-actions className="flex items-stretch gap-2 pt-1">
          <div className="min-w-0 flex-1">
            <QuickAdd product={product} />
          </div>
          <QuickView product={product} />
        </div>

        {/*
          Said on the card, not only at the checkout. A term disclosed on the
          receipt is not a term anybody agreed to.
        */}
        {!product.returnable && (
          <p className="text-12 font-medium text-warn">Non-returnable</p>
        )}
      </div>
    </article>
  );
}
