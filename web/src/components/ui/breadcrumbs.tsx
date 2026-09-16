import Link from "next/link";
import { JsonLd, jsonLd } from "@/lib/seo";
import { cn } from "@/lib/utils";

export type Crumb = { name: string; path: string };

/**
 * Breadcrumbs render visibly AND as BreadcrumbList structured data — Google
 * uses the markup for the SERP trail, so the two must never drift apart. One
 * component emitting both is the only way to guarantee that.
 */
export function Breadcrumbs({
  crumbs, onDark = false, onBanner = false,
}: {
  crumbs: Crumb[];
  onDark?: boolean;
  /**
   * Over a photograph rather than over a flat dark panel.
   *
   * `--color-dark-muted` is chosen to read on `--color-dark` and measures
   * **2.62:1** against the lightest ground a banner can produce, so on a
   * banner the trail is `dark-ink` throughout and the current page is told
   * apart by weight instead of by colour. See the note on `PageHero`.
   */
  onBanner?: boolean;
}) {
  const full = [{ name: "Home", path: "/" }, ...crumbs];

  return (
    <>
      <nav aria-label="Breadcrumb">
        <ol
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 text-13",
            onBanner ? "text-dark-ink" : onDark ? "text-dark-muted" : "text-muted",
          )}
        >
          {full.map((c, i) => {
            const last = i === full.length - 1;
            return (
              <li key={c.path} className="flex items-center gap-2">
                {last ? (
                  <span
                    aria-current="page"
                    className={cn(onBanner ? "font-semibold" : onDark ? "text-dark-ink" : "text-ink")}
                  >
                    {c.name}
                  </span>
                ) : (
                  <>
                    <Link href={c.path} className="py-1 hover:underline">{c.name}</Link>
                    <span aria-hidden className="opacity-50">/</span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd data={jsonLd.breadcrumbs(full)} />
    </>
  );
}
