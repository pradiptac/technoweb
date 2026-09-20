import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconUsers } from "@/components/icons";
import { TeamGrid } from "@/components/company/team-grid";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { buildMetadata } from "@/lib/seo";
import type { TeamMember } from "@/types/api";

export const metadata = buildMetadata({
  title: "Our team",
  description:
    "The engineers who design, install and support Technoware networks — and the certifications they hold.",
  path: "/team",
});

/**
 * Everybody the company has chosen to introduce, grouped by department in
 * the order the members are sorted. An index page and nothing more: a person
 * has no page of their own here.
 */
export default async function TeamPage() {
  let members: TeamMember[] = [];
  let failed = false;

  try {
    members = (await publicApi.team()).data;
  } catch (error) {
    if (isPrerendering) throw error;
    failed = true;
  }

  return (
    <>
      <PageHero
        section="company"
        kicker="Our team"
        title="The people who answer the phone."
        lede="Engineers first. Everybody here has racked a switch, run a cable and sat on a support call — and the certifications beside each name are current, or they are not shown."
        crumbs={[{ name: "Our team", path: "/team" }]}
      />

      <Container data-aos="fade-up" className="section-y">
        {failed ? (
          <ErrorState title="We could not load the team">Refresh in a moment.</ErrorState>
        ) : members.length === 0 ? (
          <EmptyState icon={<IconUsers />} title="Nobody listed yet">
            The team page is filled in from the console.
          </EmptyState>
        ) : (
          <TeamGrid members={members} groupByDepartment />
        )}
      </Container>

      <CtaBand />
    </>
  );
}
