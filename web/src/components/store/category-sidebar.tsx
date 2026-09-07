import Link from "next/link";
import Image from "next/image";
import { IconBox } from "@/components/icons";
import type { StoreCategory } from "@/types/api";

/**
 * The vertical category list beside a category-listing page's product grid.
 *
 * A separate component from `CategoryRail` rather than one component taking
 * a `layout` prop — a horizontal icon rail and a vertical labelled list with
 * an active state are different enough shapes that sharing one component
 * would mean more conditional branches than the two components would cost
 * combined. Both read the same `StoreCategory[]` and both render the
 * category's own icon file,
 * which is where the actual reuse is.
 */
export function CategorySidebar({
  categories, active,
}: {
  categories: StoreCategory[];
  /** The slug of the category currently being viewed. */
  active: string;
}) {
  if (categories.length === 0) return null;

  return (
    <nav aria-label="Categories" className="grid gap-0.5">
      {categories.map((c) => {
        const isActive = c.slug === active;
        return (
          <Link
            key={c.slug}
            href={`/store/categories/${c.slug}`}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors duration-200 ${
              isActive
                ? "bg-brand-50 font-semibold text-brand-ink"
                : "text-ink-2 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {/* The same mark the rail shows, at list size. */}
            {c.icon_url ? (
              <Image
                src={c.icon_url}
                alt=""
                width={36}
                height={36}
                className="size-9 shrink-0 object-contain"
                unoptimized
              />
            ) : (
              <span className="grid size-9 shrink-0 place-items-center text-faint">
                <IconBox className="size-5" />
              </span>
            )}
            <span className="min-w-0 truncate">{c.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
