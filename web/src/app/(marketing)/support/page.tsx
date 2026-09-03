import Link from "next/link";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { ArrowLink } from "@/components/ui/button";
import {
  IconBook, IconLifebuoy, IconPhone, IconTicket, IconUsers,
} from "@/components/icons";
import { publicApi } from "@/lib/api";
import { getSiteSettings } from "@/lib/settings";
import { telHref } from "@/lib/site-settings";
import { buildMetadata } from "@/lib/seo";
import type { KnowledgeArticle } from "@/types/api";
import { IconTile } from "@/components/ui/icon-tile";

export const metadata = buildMetadata({
  title: "Support",
  description:
    "Raise a ticket, track an existing one, or search the knowledge base. Technoware support is staffed by the engineers who built the infrastructure.",
  path: "/support",
});

/**
 * The support hub.
 *
 * This route was in the main navigation from the start and never existed —
 * clicking "Support" 404'd. It is deliberately built as its own page rather
 * than pointed at /portal or /contact: the people who click it split three
 * ways, and sending all of them to a login is wrong for two of the three.
 *
 * Ordered to deflect before it escalates, which is the same reason the
 * new-ticket form leads with a knowledge-base prompt.
 */
export default async function SupportPage() {
  // The links are the page; the article previews are a bonus. A failed fetch
  // degrades to the navigation rather than an error.
  const [articles, settings] = await Promise.all([
    publicApi.knowledgeArticles().then((r) => r.data).catch(() => [] as KnowledgeArticle[]),
    getSiteSettings(),
  ]);

  const phone = settings.phone;

  const routes = [
    {
      href: "/knowledge-base",
      icon: IconBook,
      title: "Search the knowledge base",
      body: "Configuration steps and common faults, written by the engineers who fix them. Start here — most answers are already written down.",
    },
    {
      href: "/portal/tickets/new",
      icon: IconTicket,
      title: "Raise a ticket",
      body: "For customers under contract. Attach logs or photographs, and the SLA clock starts when you submit.",
    },
    {
      href: "/portal/tickets",
      icon: IconLifebuoy,
      title: "Track a ticket",
      body: "Every reply, attachment and status change on your existing tickets.",
    },
    {
      href: "/portal/login",
      icon: IconUsers,
      title: "Customer login",
      body: "The portal for your organisation, including contact details and past correspondence.",
    },
  ];

  return (
    <>
      <PageHero
        kicker="Support"
        title="A desk that answers, staffed by engineers."
        lede="Not a call centre reading a script. The people who take your ticket are the ones who racked the equipment, and they have the documentation to hand."
        crumbs={[{ name: "Support", path: "/support" }]}
      />

      <Container data-aos="fade-up" className="section-y">
        <div className="grid gap-4 sm:grid-cols-2">
          {routes.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="rounded-lg border border-line-strong bg-card p-5.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-2"
            >
              <IconTile size="lg" className="mb-4">
                <r.icon />
              </IconTile>
              <h2 className="text-[16.5px]">{r.title}</h2>
              <p className="mt-1.5 text-[13.5px] leading-[1.55] text-muted">{r.body}</p>
            </Link>
          ))}
        </div>

        {phone && (
          <section data-aos="fade-up" className="mt-10 rounded-lg border border-line-strong bg-surface p-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-brand-200 bg-card text-brand-ink">
                <IconPhone className="size-[19px]" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[16.5px]">Something is down right now</h2>
                <p className="mt-1 text-[13.5px] leading-[1.55] text-muted">
                  For an outage affecting production, call rather than raise a
                  ticket. Mon–Sat, 9:30–18:30 IST, with out-of-hours escalation
                  for sites under an{" "}
                  <Link href="/solutions/amc" className="font-semibold text-brand-ink hover:underline">
                    AMC contract
                  </Link>
                  .
                </p>
              </div>
              <a
                href={telHref(phone)}
                className="rounded bg-dark px-4 py-2.5 text-[13.5px] font-semibold whitespace-nowrap text-white transition-colors hover:bg-dark-2"
              >
                {phone}
              </a>
            </div>
          </section>
        )}

        {articles.length > 0 && (
          <section data-aos="fade-up" className="mt-14">
            <div className="mb-5 flex items-center gap-3">
              <h2 className="display-3">Common questions</h2>
              <ArrowLink href="/knowledge-base" className="ml-auto">All guides</ArrowLink>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {articles.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/knowledge-base/${a.slug}`}
                    className="block h-full rounded-lg border border-line-strong bg-card p-5 transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    <h3 className="text-[15.5px]">{a.title}</h3>
                    {a.excerpt && <p className="mt-1.5 text-[13.5px] leading-[1.55] text-muted">{a.excerpt}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Container>

      <CtaBand
        title="Not a customer yet?"
        body="Support contracts are how most of our work starts — see what an AMC covers, or tell us what you are running and we will say honestly whether we can improve on it."
      />
    </>
  );
}
