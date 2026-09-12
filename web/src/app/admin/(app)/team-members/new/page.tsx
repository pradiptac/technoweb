import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getTeamMemberList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { TeamMemberForm } from "../team-member-form";

export const metadata = buildMetadata({ title: "New team member", path: "/admin/team-members/new", seo: noIndex });

export default async function NewTeamMemberPage() {
  // The index is fetched for its `meta.departments` alone — the datalist
  // behind the department field. The `/admin/popups/new` shape.
  let meta;
  try {
    ({ meta } = await getTeamMemberList({ per_page: 1 }));
  } catch {
    return <ErrorState title="We could not load this screen">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/team-members", label: "All team members" }} title="New team member" />
      <TeamMemberForm meta={meta} />
    </>
  );
}
