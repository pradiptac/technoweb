import Link from "next/link";
import { Select } from "@/components/ui/input";
import { IconSearch } from "@/components/icons";
import { BasketIndicator } from "@/components/store/basket-bar";
import type { StoreCategory } from "@/types/api";

/**
 * The shop's control strip: find something on the left, what is already in the
 * basket on the right.
 *
 * It began inline on `/store` and is a component because other screens wanted
 * it — the category and product pages, which carried `BasketBar` instead: a strip
 * saying "Store · All prices include 18% GST" with the basket at the far end.
 * That row had no search on it, so somebody browsing a category who wanted a
 * part number had to go back to the shop's front page to type it. Two bars, one
 * of which was the useful one, on two halves of the same shop.
 *
 * **It always submits to `/store`.** A category page's own loader takes a slug
 * and nothing else, so pointing the form at the current URL would render a
 * search box that discards what was typed into it. Searching from inside a
 * category therefore lands on the shop's listing with that category still
 * selected — the results are the same set, narrowed, and the select says so.
 *
 * A server component, because `BasketIndicator` reads the cart per request and
 * a basket cannot be cached.
 */
export async function StoreFilterBar({
  categories, q, category, sort, sticky = true,
}: {
  categories: StoreCategory[];
  q?: string;
  /** Preselects the category. On a category page this is that page's slug. */
  category?: string;
  sort?: string;
  /**
   * Whether the strip docks under the header as the page scrolls.
   *
   * True on a **listing**, where somebody scrolls a grid and then wants to
   * narrow it — that is the whole reason it sticks. False on a product page,
   * and not for want of room: that page already pins the buy panel, and two
   * sticky bands stacked down the screen is 159px of permanent chrome plus an
   * offset on the second one that has to be kept in step with the first one's
   * height by hand. One thing pins per page, and on the page with the Add to
   * basket button it is the price rather than the search box.
   */
  sticky?: boolean;
}) {
  const filtered = Boolean(q || category);

  return (
    /*
      The strip follows the page down, docked under the site header.

      Searching a catalogue means scrolling a grid and then wanting to narrow
      it, and the control that narrows it was at the top of a page somebody had
      scrolled away from — so refining a search meant scrolling back up, which
      is also where the basket lives. It sticks from `lg` up only, and that is a
      measurement rather than caution: below that the strip is three rows and
      174px tall, so on a 360x640 phone it and the header together would hold
      38% of the screen open permanently over the grid it exists to filter. A
      phone gets the strip at the top of the page, where the whole screen is the
      list.

      `top-[var(--h-site-header)]` — the header is `sticky top-0` and that
      variable is its outer height, so this is the one number the two files
      share and it is declared once in `globals.css`. `z-30` sits it under the
      header's `z-40`, or the bar would slide over the navigation it is supposed
      to dock beneath.

      The wrapper is what makes it opaque rather than the form: the card is
      `rounded-xl`, so content scrolling under it shows through the corner cuts
      and past the shadow. A band of `bg-page` behind it — `-mx-1 px-1` so it
      clears the card's own edge, the shape `moderation-list.tsx` already uses —
      is what content actually passes behind. The padding is on that band for
      the same reason: as margin it would collapse and leave a transparent gap
      at the top of the stuck state.
    */
    <div
      className={[
        "-mx-1 mb-5 px-1",
        sticky ? "lg:sticky lg:top-[var(--h-site-header)] lg:z-30 lg:bg-page lg:py-3" : "",
      ].join(" ")}
    >
      {/*
        One height for everything in it — `h-11` on the input, both selects and
        the button. They were three different heights before (the shared `field`
        class is 43px, the search input was 38px, the button 36px), which on one
        row reads as three unrelated controls that happen to be adjacent rather
        than one instrument.

        Laid out as a grid rather than a wrapping flex row, because the two
        arrangements are genuinely different rather than one reflowing: on a
        phone the search takes a full row, the two selects share the next, and
        the button sits beside the basket. A flex row wrapping into that shape
        needs basis arithmetic at three breakpoints and still leaves the button
        stranded on a line of its own.
      */}
      <form
        action="/store"
        /*
          `items-center`, not `items-end`. The selects carried a label above them
          and the search did not, so the row could only be aligned on its bottom
          edge; with the labels gone every control is the same 44px box and
          centring them is what makes the strip read as one instrument rather
          than four things resting on a shelf.
        */
        className="mb-3 grid grid-cols-2 gap-x-2.5 gap-y-2.5 rounded-xl border border-line-strong bg-card p-2.5 shadow-1 lg:mb-0 lg:flex lg:items-center lg:gap-2.5"
      >
        <div className="col-span-2 min-w-0 lg:flex-1">
          {/*
            `sr-only`, not deleted. The magnifier and the placeholder are enough
            to look at and are nothing to a screen reader — a placeholder is not
            a label, and an input labelled only by one is announced as "edit
            text, blank". The same call the footer's newsletter field makes.
          */}
          <label htmlFor="q" className="sr-only">Search the store</label>
          {/*
            The glyph sits inside the field rather than beside it, so it reads as
            part of the control. `pointer-events-none` on the icon and left
            padding on the input, or the icon eats the click that should focus
            the field.
          */}
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-faint">
              <IconSearch className="size-[18px]" />
            </span>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Name, part number or brand…"
              className="h-11 w-full rounded-lg border border-line-strong bg-surface pl-11 pr-3 text-[14.5px] transition-all duration-200 ease-brand placeholder:text-faint focus:border-brand-400 focus:outline-none focus:ring-3 focus:ring-brand-100"
            />
          </div>
        </div>

        {categories.length > 0 && (
          <div className="min-w-0 lg:w-[176px]">
            {/*
              `sr-only`, and the placeholder option carries the meaning instead —
              "All categories" says what the control selects where the bare word
              "Everything" needed the label above it to mean anything. A select
              with a hidden label and a value that does not name its own subject
              is a control you have to open to understand.
            */}
            <label htmlFor="category" className="sr-only">Category</label>
            <Select
              id="category"
              name="category"
              defaultValue={category ?? ""}
              className="h-11 rounded-lg bg-surface py-0 text-[14.5px]"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>{c.name}</option>
              ))}
            </Select>
          </div>
        )}

        <div className="min-w-0 lg:w-[176px]">
          <label htmlFor="sort" className="sr-only">Sort</label>
          <Select
            id="sort"
            name="sort"
            defaultValue={sort ?? "featured"}
            className="h-11 rounded-lg bg-surface py-0 text-[14.5px]"
          >
            {/*
              Every option names the axis, not just the direction. With the
              "Sort" label gone, "Featured" alone reads as something being
              filtered *to*; "Featured first" can only be an ordering.
            */}
            <option value="featured">Featured first</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
            <option value="name">Name: A to Z</option>
            <option value="newest">Newest first</option>
          </Select>
        </div>

        {/*
          The button and the basket share a row on a phone and sit at the end of
          the strip on a wide screen. `col-span-2` so they keep the full width
          when the selects are side by side above them.
        */}
        <div className="col-span-2 flex items-center gap-3 lg:col-span-1">
          <button
            type="submit"
            className="h-11 shrink-0 rounded-lg bg-brand-600 px-6 text-[14px] font-semibold text-white transition-colors duration-200 hover:bg-brand-700"
          >
            Apply
          </button>

          {filtered && (
            <Link
              href="/store"
              className="shrink-0 text-[13.5px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Clear
            </Link>
          )}

          {/*
            The basket at the end of the same strip rather than in a band of its
            own — one row of controls, and the honest arrangement anyway: the
            strip this replaced carried a "Store" link and a sentence about GST,
            neither of which is a control.

            `ml-auto` pushes it to the far end on both layouts, so on a phone it
            sits opposite Apply instead of crowding it. The rule only appears
            once they are genuinely on one line; below that it would be a mark
            separating nothing.
          */}
          <span aria-hidden className="ml-auto hidden h-7 w-px bg-line-strong lg:block" />
          <div className="ml-auto lg:ml-0">
            <BasketIndicator />
          </div>
        </div>
      </form>
    </div>
  );
}
