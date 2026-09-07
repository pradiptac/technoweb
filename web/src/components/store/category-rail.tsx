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
 */
export function CategoryRail({ categories }: { categories: StoreCategory[] }) {
  if (categories.length === 0) return null;

  return (
    <div className="flex gap-5 overflow-x-auto pb-1 [scrollbar-width:thin]">
      {categories.map((c) => (
        <Link
          key={c.slug}
          href={`/store/categories/${c.slug}`}
          className="group flex w-24 shrink-0 flex-col items-center gap-2 text-center"
        >
          <span /*
              `size-20` with `p-1.5`: the tile was 64px with 10px of padding,
              which left the mark 44px — and these icons are rendered with their
              own margin inside the file, so the drawn object was smaller again.
              80px with tight padding gives the mark 68px, half as big again.
            */
            className="grid size-20 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-2 p-1.5 transition-transform duration-200 group-hover:scale-105">
            {c.icon_url ? (
              <Image
                src={c.icon_url}
                alt=""
                width={68}
                height={68}
                className="size-full object-contain"
                unoptimized
              />
            ) : (
              <span className="text-faint"><IconBox className="size-7" /></span>
            )}
          </span>
          <span className="line-clamp-2 text-[12.5px] leading-tight text-ink">{c.name}</span>
        </Link>
      ))}
    </div>
  );
}
