import Link from "next/link";
import Image from "next/image";
import { IconBox } from "@/components/icons";
import type { StoreCategory } from "@/types/api";

/**
 * "Shop by Categories" — a horizontal rail of circular tiles, one per store
 * category.
 *
 * **The mark is the category's own icon file, and there is no icon-set
 * fallback.** These are 3D icons: pictures rather than glyphs, so they cannot
 * take a colour from `currentColor` and they are stored as an `icon_path` on
 * the record rather than as a key into `iconMap`. Falling back to a line glyph
 * would draw the rail in two different languages depending on which categories
 * an editor had got to — worse than an obviously empty tile, which at least
 * says what is missing.
 *
 * The tile behind the mark is a plain neutral circle. The tint used to come
 * from the category's icon key, and with that gone there is nothing to derive a
 * hue from — but there is also nothing to derive it *for*: a 3D icon arrives
 * with its own colours, and a tinted ground behind one is a second colour
 * argument the glyph version never had.
 *
 * `object-contain` with padding, never `object-cover`: cropping a mark on a
 * transparent ground to fill a circle cuts the top off the object it depicts.
 *
 * `overflow-x-auto`, not `flex-wrap` — contained scroll, so a growing category
 * list cannot widen the page and trip the zero-tolerance overflow check.
 *
 * **Centred while it fits, scrolling from the left once it does not.** Asked
 * for on 2026-09-16: six tiles sat against the left edge with the right third
 * of the page empty. `justify-center` on the scroll container is the obvious
 * fix and the wrong one — a centred overflowing flex row clips its first
 * tiles on the left, where no scroll can reach them. So the track is an inner
 * `w-max` row with `mx-auto`: narrower than the container the auto margins
 * centre it, wider they resolve to zero and the row scrolls from its first
 * tile. Snap points keep a tile whole after a swipe.
 */
export function CategoryRail({ categories }: { categories: StoreCategory[] }) {
  if (categories.length === 0) return null;

  return (
    <div className="snap-x snap-mandatory overflow-x-auto [scrollbar-width:thin]">
      <div className="mx-auto flex w-max gap-5 px-1">
      {categories.map((c) => (
        <Link
          key={c.slug}
          href={`/store/categories/${c.slug}`}
          className="group flex w-24 shrink-0 snap-start flex-col items-center gap-1.5 text-center"
        >
          <span /*
              The mark's square has to fit inside the circle *diagonally*, not
              just side to side: the client's 3D icons fill their frame to the
              corners, and at 66px inside an 80px disc the corners reached
              47px from the centre against a 40px radius — the Wi-Fi arcs
              crossed the ring (reported 2026-09-17, "icon overlapped"). 60px
              in 88px: a diagonal of 85px inside a radius of 44.
            */
            className="category-disc grid size-22 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-2 p-3.5 transition-[scale,box-shadow,border-color] duration-(--duration-base) group-hover:scale-105 group-hover:border-brand-300">
            {c.icon_url ? (
              <Image
                src={c.icon_url}
                alt=""
                width={60}
                height={60}
                className="size-full object-contain"
              />
            ) : (
              <span className="text-faint"><IconBox className="size-7" /></span>
            )}
          </span>
          <span className="line-clamp-2 text-12-5 leading-tight text-ink">{c.name}</span>
        </Link>
      ))}
      </div>
    </div>
  );
}
