import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getTeamMember, type TeamMemberMeta } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { TeamMemberForm } from "../team-member-form";
import { deleteTeamMemberAction } from "../actions";
import type { AdminTeamMember } from "@/types/api";

export const metadata = buildMetadata({ title: "Edit team member", path: "/admin/team-members", seo: noIndex });

export default async function EditTeamMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  let member: AdminTeamMember;
  let meta: TeamMemberMeta;
  try {
    ({ data: member, meta } = await getTeamMember(numericId));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/team-members", label: "All team members" }} title="Edit team member">
        <Badge tone={member.status === "published" ? "resolved" : "progress"}>{member.status}</Badge>
      </PageHeader>

      <TeamMemberForm member={member} meta={meta} />

      <form action={deleteTeamMemberAction} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={member.id} />
        <p className="mb-2 text-[13px] text-muted">
          Deleting this takes them off the site, certifications and all. The photo stays in the media library.
        </p>
        <Button type="submit" variant="ghost" size="sm" className="text-err">Delete team member</Button>
      </form>
    </>
  );
}
