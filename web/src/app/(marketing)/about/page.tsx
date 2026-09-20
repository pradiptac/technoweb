import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { IconCheck } from "@/components/icons";
import { ArrowLink } from "@/components/ui/button";
import { CertificationCards } from "@/components/company/certification-cards";
import { ClientWall } from "@/components/company/client-wall";
import { TeamGrid } from "@/components/company/team-grid";
import { publicApi } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { heroStats, processSteps } from "@/content/site";

export const metadata = buildMetadata({
  title: "About",
  description:
    "Technoware designs, deploys and supports network, server and security infrastructure — with the documentation and the support desk that most vendors leave out.",
  path: "/about",
});

const principles = [
  {
    title: "We would rather not sell you something",
    body: "If a switch has three good years left, we say so. Replacing working equipment is easy revenue and a bad reason to lose a client.",
  },
  {
    title: "The documentation is yours",
    body: "IP schemas, rack labels, credentials, as-built diagrams — handed over properly, and still yours if you later move to someone else.",
  },
  {
    title: "One number, one accountable party",
    body: "We supply, install and support. There is nobody to point at when something breaks, which is precisely the point.",
  },
];

/**
 * Async now, for three supplementary sections — the team, the clients and
 * the certifications — each caught on its own. They are furniture on a page
 * that was static before them, so a failed read hides a section rather than
 * erroring the page, and none of them can fail a build. Every one renders
 * nothing when its list is empty.
 */
export default async function AboutPage() {
  const [team, clients, certifications] = await Promise.all([
    publicApi.team().then((r) => r.data).catch(() => []),
    publicApi.clients().then((r) => r.data).catch(() => []),
    publicApi.certifications().then((r) => r.data).catch(() => []),
  ]);
  const featuredClients = clients.filter((c) => c.is_featured);
  const wall = featuredClients.length > 0 ? featuredClients : clients;

  return (
    <>
      <PageHero
        section="company"
        kicker="About"
        title="Engineers first, resellers second."
        lede="Technoware supplies and supports the infrastructure businesses actually run on — networks, servers, storage, security and surveillance. The hardware is the easy part; being reachable afterwards is what people stay for."
        crumbs={[{ name: "About", path: "/about" }]}
      />

      <Container data-aos="fade-up" className="section-y">
        <dl className="mb-16 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line-strong bg-line md:grid-cols-4">
          {heroStats.map((s) => (
            <div key={s.label} className="bg-card p-6">
              <dd className="font-display text-[30px] font-bold leading-none tracking-[-.03em]">{s.value}</dd>
              <dt className="mt-2 text-13 text-muted">{s.label}</dt>
            </div>
          ))}
        </dl>

        <section data-aos="fade-up" className="mb-16 grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div>
            <h2 className="display-3">How we work</h2>
            <p className="lede mt-4">
              Most IT problems are handover problems. Someone sells the box, someone else racks
              it, and nobody owns the outcome. Keeping all four stages under one roof is the
              whole model.
            </p>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-lg border border-line-strong bg-line">
            {processSteps.map((s) => (
              <li key={s.n} className="grid grid-cols-[auto_1fr] items-start gap-4 bg-card p-5">
                <span className="grid size-7 place-items-center rounded-full border border-brand-200 bg-brand-50 font-mono text-11 font-medium text-brand-ink">
                  {s.n}
                </span>
                <div>
                  <h3 className="text-15-5">{s.title}</h3>
                  <p className="mt-1 text-14 leading-[1.55] text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {team.length > 0 && (
          <section data-aos="fade-up" className="mb-16">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <h2 className="display-3">The team</h2>
              {team.length > 8 && <ArrowLink href="/team">Meet the whole team</ArrowLink>}
            </div>
            <TeamGrid members={team.slice(0, 8)} headingLevel={3} />
          </section>
        )}

        {wall.length > 0 && (
          <section data-aos="fade-up" className="mb-16">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <h2 className="display-3">Who we work for</h2>
              <ArrowLink href="/clients">All clients</ArrowLink>
            </div>
            <ClientWall clients={wall.slice(0, 12)} headingLevel={3} />
          </section>
        )}

        {certifications.length > 0 && (
          <section data-aos="fade-up" className="mb-16">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <h2 className="display-3">Certified</h2>
              <ArrowLink href="/certifications">All certifications</ArrowLink>
            </div>
            <CertificationCards items={certifications.slice(0, 4)} headingLevel={3} />
          </section>
        )}

        <section>
          <h2 className="display-3 mb-6">What we hold to</h2>
          <ul className="grid gap-4 lg:grid-cols-3">
            {principles.map((p) => (
              <li key={p.title} className="rounded-lg border border-line-strong bg-card p-5.5">
                <IconCheck className="mb-3.5 size-5 text-brand-ink" />
                <h3 className="text-[16px]">{p.title}</h3>
                <p className="mt-2 text-14 leading-[1.6] text-muted">{p.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </Container>

      <CtaBand />
    </>
  );
}
