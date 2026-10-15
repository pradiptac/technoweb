import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Illustration } from "@/components/ui/illustrations";
import { Input } from "@/components/ui/input";
import { PageHero } from "@/components/ui/page-hero";
import { NotFoundSuggestions } from "@/components/layout/not-found-suggestions";

/**
 * The body of the 404, shared by the two boundaries that can render it.
 *
 * Deliberately no <Breadcrumbs>. That component also emits BreadcrumbList
 * structured data, and a page that answers 404 should not be describing
 * itself to search engines as a position in the site tree.
 *
 * Since 0.122.0 it searches the whole site rather than the knowledge base
 * alone — most missing addresses are a product or a page, not a guide — and
 * `NotFoundSuggestions` offers what the address itself seems to name.
 */

const DESTINATIONS = [
  { href: "/solutions", title: "Solutions", blurb: "Networking, servers, storage, security and surveillance." },
  { href: "/products", title: "Products", blurb: "The hardware catalogue, by category and by brand." },
  { href: "/support", title: "Support", blurb: "Raise a ticket, or check one you have already raised." },
  { href: "/knowledge-base", title: "Knowledge base", blurb: "Setup guides and fixes for the things we are asked most." },
];

export function NotFoundContent() {
  return (
    <>
      <PageHero
        kicker="404"
        title="We could not find that page"
        lede="The link may be out of date, or the address may have a typo in it. Search for what you were after, or pick the thread back up below."
      />

      <Container className="section-y">
        <div className="grid items-center gap-10 lg:grid-cols-[7fr_5fr] lg:gap-16">
          <div>
            <h2 className="display-3">Search the site</h2>
            <p className="mt-2.5 text-15 text-muted">
              Products, solutions, guides and articles — by name or by part number.
            </p>
            {/* A plain GET to `/search`, so it works before any script loads. */}
            <form action="/search" role="search" className="mt-5 flex max-w-[560px] gap-2">
              <label htmlFor="not-found-q" className="sr-only">Search the site</label>
              <Input id="not-found-q" name="q" type="search" placeholder="Search…" required minLength={2} className="min-w-0 flex-1" />
              <Button type="submit">Search</Button>
            </form>

            <NotFoundSuggestions />
          </div>

          {/* Decorative, so it gives way on a phone rather than pushing the search down a screen. */}
          <Illustration name="lost" className="mx-auto hidden h-auto w-full max-w-[320px] lg:block" />
        </div>

        <h2 className="display-3 mt-14">Or start from one of these</h2>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DESTINATIONS.map((d) => (
            <li key={d.href}>
              <Link
                href={d.href}
                className="flex h-full flex-col rounded-lg border border-line-strong bg-card p-5 transition-all duration-(--duration-base) hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-2"
              >
                <span className="text-15-5 font-semibold">{d.title}</span>
                <span className="mt-1.5 text-13-5 leading-[1.55] text-muted">{d.blurb}</span>
                <span className="mt-auto pt-4 text-13-5 font-semibold text-brand-ink">
                  Go →
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-14 text-muted">
          Still stuck?{" "}
          <Link href="/contact" className="font-semibold text-brand-ink hover:underline">
            Get in touch
          </Link>{" "}
          and tell us what you were looking for.
        </p>
      </Container>
    </>
  );
}
