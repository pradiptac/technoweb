import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconLayers } from "@/components/icons";
import { getNewsletterTemplates } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { NewsletterTemplate } from "@/types/api";
import { TemplateGallery } from "./template-gallery";

export const metadata = buildMetadata({ title: "Templates", path: "/admin/newsletter/templates", seo: noIndex });

export default async function TemplatesPage() {
  let templates: NewsletterTemplate[];

  try {
    templates = await getNewsletterTemplates();
  } catch {
    return <ErrorState title="We could not load the templates">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader
        title="Templates"
        back={{ href: "/admin/newsletter", label: "Newsletter" }}
        lede={<>
          Starting points for a campaign. A template is a set of blocks, and choosing one copies
          them — so editing a template later never changes a campaign already written from it.
        </>}
      >
        <div className="ml-auto">
          <ButtonLink href="/admin/newsletter/campaigns/new" size="sm">Start a campaign</ButtonLink>
        </div>
      </PageHeader>

      {templates.length === 0 ? (
        <EmptyState icon={<IconLayers />} title="No templates">
          The ten that ship with the system are added by the seeder — run
          <code className="mx-1 font-mono text-[12.5px]">php artisan db:seed --class=NewsletterTemplateSeeder</code>
          to put them back.
        </EmptyState>
      ) : (
        <TemplateGallery templates={templates} />
      )}
    </>
  );
}
