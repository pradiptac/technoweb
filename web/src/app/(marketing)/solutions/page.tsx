import { Container } from "@/components/ui/container";
import { Card, CardHead } from "@/components/ui/card";
import { ArrowLink } from "@/components/ui/button";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { ErrorState } from "@/components/ui/empty";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { buildMetadata } from "@/lib/seo";
import type { Solution } from "@/types/api";

export const metadata = buildMetadata({
  title: "Solutions",
  description:
    "Networking, servers, storage, firewall, Wi-Fi, backup, cybersecurity, surveillance and AMC — designed, deployed and supported by Technoware engineers.",
  path: "/solutions",
});

export default async function SolutionsPage() {
  let solutions: Solution[] = [];
  let failed = false;

  try {
    solutions = (await publicApi.solutions()).data;
  } catch (error) {
    // Never ship a prerendered error page — break the build instead.
    if (isPrerendering) throw error;
    failed = true;
  }

  return (
    <>
      <PageHero
        kicker="Solutions"
        title="Infrastructure built once, supported for years."
        lede="Nine practice areas, one accountable partner — from the switch fabric to the firewall policy to the AMC contract behind it."
        crumbs={[{ name: "Solutions", path: "/solutions" }]}
      />

      <Container data-aos="fade-up" className="section-y">
        {failed ? (
          <ErrorState title="We could not load the solutions list">
            Refresh in a moment, or call us and we will talk it through directly.
          </ErrorState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {solutions.map((s) => {
              return (
                <Card key={s.id}>
                  <CardHead iconName={s.icon} as="h2">{s.title}</CardHead>
                  <p className="text-[14.5px] leading-[1.58] text-muted">{s.summary}</p>
                  <ArrowLink href={`/solutions/${s.slug}`} className="mt-4">Read more</ArrowLink>
                </Card>
              );
            })}
          </div>
        )}
      </Container>

      <CtaBand />
    </>
  );
}
