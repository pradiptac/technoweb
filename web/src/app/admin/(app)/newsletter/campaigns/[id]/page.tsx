import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { getNewsletterCampaign, getNewsletterGroups, getNewsletterTemplates } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { CampaignEditor } from "../campaign-editor";

export const metadata = buildMetadata({ title: "Campaign", path: "/admin/newsletter/campaigns", seo: noIndex });

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let campaign, groups, templates;

  try {
    [campaign, groups, templates] = await Promise.all([
      getNewsletterCampaign(Number(id)),
      getNewsletterGroups(),
      getNewsletterTemplates(),
    ]);
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 404) notFound();

    return <ErrorState title="We could not load this campaign">The admin API is not responding.</ErrorState>;
  }

  /*
    A sequence step is edited here for its content and belongs to its
    sequence, so the header says which step of what and goes back there —
    the campaigns list does not hold it.
  */
  const step = campaign.sequence ?? null;

  return (
    <>
      <PageHeader
        title={step ? `Step ${step.position} of ${step.name}` : campaign.name}
        back={step
          ? { href: `/admin/newsletter/sequences/${step.id}?tab=steps`, label: step.name }
          : { href: "/admin/newsletter/campaigns", label: "Campaigns" }}
        lede={step ? campaign.subject : undefined}
      >
        <div className="ml-auto flex items-center gap-2">
          <Badge tone={campaign.status === "sent" ? "resolved" : "closed"}>{campaign.status_label}</Badge>
          {campaign.status !== "draft" && (
            <ButtonLink href={`/admin/newsletter/campaigns/${campaign.id}/report`} variant="secondary" size="sm">
              Report
            </ButtonLink>
          )}
        </div>
      </PageHeader>

      <CampaignEditor
        campaign={campaign}
        groups={groups}
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
      />
    </>
  );
}
