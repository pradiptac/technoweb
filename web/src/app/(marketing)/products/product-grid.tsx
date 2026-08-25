import Link from "next/link";
import { IconServer } from "@/components/icons";
import { STAGGER } from "@/lib/utils";
import type { Paginated, Product } from "@/types/api";

/** Shared listing grid — used by /products and by every category listing. */
export function ProductGrid({
  page, basePath, params = {}, headingLevel = 3,
}: {
  page: Paginated<Product>;
  basePath: string;
  params?: Record<string, string | undefined>;
  /**
   * Card titles are h3 beneath an "All products" h2, but h2 on a category
   * listing where the page h1 is the only heading above them. Passing the
   * level keeps the document outline valid in both places.
   */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const href = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") q.set(k, v);
    if (n > 1) q.set("page", String(n));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {page.data.map((p, i) => (
          <li key={p.id} data-aos="fade-up" data-aos-delay={STAGGER[i % STAGGER.length]}>
            <Link
              href={`/products/${p.slug}`}
              className="flex h-full flex-col overflow-hidden rounded-lg border border-line-strong bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-2"
            >
              {/*
                The image is absolutely positioned, which is the only thing
                that actually holds it to 160px.

                It used to be an in-flow grid item with h-full. The well is
                `grid place-items-center`, so the item is never stretched and
                height:100% had nothing definite to resolve against — the
                800x600 placeholder's own aspect ratio won, rendering 385px
                tall and painting over the brand, name, SKU and description
                below it.

                max-h-full does not fix it either, and it is worth knowing
                why: the auto row track is sized to its content, so the grid
                area itself grew to 385px and `max-height: 100%` resolved
                against *that*, not against the well. Taking the image out of
                flow stops it sizing the track at all, and inset-0 gives
                object-contain a real 160px box to fit inside.
              */}
              <div className="relative grid h-40 place-items-center overflow-hidden border-b border-line bg-surface">
                {p.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.images[0]}
                    /* The library's description of this file. Empty only
                       when nobody has written one — an unlabelled product
                       photo is a real gap, not a decorative image. */
                    alt={p.image_alts?.[0] ?? ""}
                    className="absolute inset-0 h-full w-full object-contain p-5"
                    loading="lazy"
                  />
                ) : (
                  <IconServer className="size-10 text-line-strong" />
                )}
              </div>
              <div className="flex flex-1 flex-col p-4.5">
                {p.brand?.name && (
                  <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-brand-ink">
                    {p.brand.name}
                  </span>
                )}
                <Heading className="mt-1.5 text-[15.5px] leading-snug">{p.name}</Heading>
                {p.sku && <span className="mt-1 font-mono text-[12px] text-muted">{p.sku}</span>}
                {p.short_description && (
                  <p className="mt-2.5 text-[13.5px] leading-[1.55] text-muted">{p.short_description}</p>
                )}
                <span className="mt-auto pt-4 text-[13.5px] font-semibold text-brand-ink">
                  View details →
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {page.meta.last_page > 1 && (
        <nav className="mt-8 flex items-center justify-between gap-3" aria-label="Pagination">
          <span className="text-[13px] text-muted">
            Page {page.meta.current_page} of {page.meta.last_page} · {page.meta.total} products
          </span>
          <span className="flex gap-2">
            {page.meta.current_page > 1 && (
              <Link href={href(page.meta.current_page - 1)} className="rounded border border-line-strong bg-card px-3.5 py-2.5 text-[13.5px] font-semibold hover:border-faint">
                Previous
              </Link>
            )}
            {page.meta.current_page < page.meta.last_page && (
              <Link href={href(page.meta.current_page + 1)} className="rounded border border-line-strong bg-card px-3.5 py-2.5 text-[13.5px] font-semibold hover:border-faint">
                Next
              </Link>
            )}
          </span>
        </nav>
      )}
    </>
  );
}
