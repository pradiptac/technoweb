import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { KbSearchForm } from "@/app/(marketing)/knowledge-base/search-form";

/**
 * The body of the 404, shared by the two boundaries that can render it.
 *
 * Deliberately no <Breadcrumbs>. That component also emits BreadcrumbList
 * structured data, and a page that answers 404 should not be describing
 * itself to search engines as a position in the site tree.
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
        lede="The link may be out of date, or the address may have a typo in it. Everything below is a good place to pick the thread back up."
      />

      <Container className="section-y">
        <div className="max-w-[640px]">
          <h2 className="display-3">Search the knowledge base</h2>
          <p className="mt-2.5 text-[15px] text-muted">
            If you arrived here looking for a guide or a fix, this is the
            fastest way to find it.
          </p>
          <div className="mt-5">
            {/*
              KbSearchForm reads useSearchParams, and Next prerenders this
              route as /_not-found — without a Suspense boundary that is a
              build error, not a runtime one.
            */}
            <Suspense fallback={null}>
              <KbSearchForm />
            </Suspense>
          </div>
        </div>

        <h2 className="display-3 mt-14">Or start from one of these</h2>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DESTINATIONS.map((d) => (
            <li key={d.href}>
              <Link
                href={d.href}
                className="flex h-full flex-col rounded-lg border border-line-strong bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-2"
              >
                <span className="text-[15.5px] font-semibold">{d.title}</span>
                <span className="mt-1.5 text-[13.5px] leading-[1.55] text-muted">{d.blurb}</span>
                <span className="mt-auto pt-4 text-[13.5px] font-semibold text-brand-ink">
                  Go →
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-[14px] text-muted">
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
