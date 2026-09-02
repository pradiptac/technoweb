import Link from "next/link";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";
import type { BlogCategorySummary } from "@/types/api";

/**
 * The blog's own navigation, under the site header.
 *
 * A strip rather than entries in the main header, the answer the newsletter
 * and the store already give: the site header is at its measured limit — both
 * flanking groups are `shrink-0` and the consultation button is a fixed
 * 150px — and six category names would reopen the 320px overflow the logo cap
 * exists for.
 *
 * **It scrolls rather than wraps.** Wrapping is the obvious choice and is
 * wrong here: the number of categories is editorial and unbounded, so at 320px
 * a wrapping strip becomes four rows of chrome above the first article. One
 * scrolling row is always one row. `-mx` plus matching padding lets it bleed
 * to the screen edge, so the last item is visibly cut off — which is what
 * tells somebody there is more.
 */
export function CategoryStrip({
  categories, active,
}: {
  categories: BlogCategorySummary[];
  active?: string;
}) {
  if (categories.length === 0) return null;

  return (
    <nav aria-label="Blog categories" className="border-b border-line bg-surface-2">
      <Container>
        <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 py-2.5 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <li>
            <StripLink href="/blog" active={!active}>All</StripLink>
          </li>

          {categories.map((category) => (
            <li key={category.id}>
              <StripLink
                href={`/blog/category/${category.slug}`}
                active={category.slug === active}
              >
                {category.name}
              </StripLink>
            </li>
          ))}
        </ul>
      </Container>
    </nav>
  );
}

function StripLink({
  href, active, children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        // `whitespace-nowrap` with a scrolling parent, never with a wrapping
        // one: a nowrap item in a row that cannot scroll paints outside its
        // box, which is the defect the dashboard's "Today" label taught and
        // which no overflow check catches.
        "block rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold tracking-[.04em] whitespace-nowrap uppercase transition-colors",
        active
          ? "bg-brand-600 text-white"
          : "text-muted hover:bg-card hover:text-brand-ink",
      )}
    >
      {children}
    </Link>
  );
}
