import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getNewsletterTemplates } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { NewsletterTemplate } from "@/types/api";
import { NewCampaign } from "./new-campaign";

export const metadata = buildMetadata({ title: "New campaign", path: "/admin/newsletter/campaigns/new", seo: noIndex });

export default async function NewCampaignPage() {
  let templates: NewsletterTemplate[];

  try {
    templates = await getNewsletterTemplates();
  } catch {
    return <ErrorState title="We could not load the templates">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader
        title="New campaign"
        back={{ href: "/admin/newsletter/campaigns", label: "Campaigns" }}
        lede={<>
          Pick a starting point. A template is a set of blocks, so anything in it can be
          changed afterwards — nothing here is a commitment.
        </>}
      />

      <NewCampaign templates={templates} />
    </>
  );
}
