import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getNewsletterGroups } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { NewsletterGroup } from "@/types/api";
import { ImportWizard } from "./import-wizard";

export const metadata = buildMetadata({ title: "Import subscribers", path: "/admin/newsletter/subscribers/import", seo: noIndex });

export default async function ImportPage() {
  let groups: NewsletterGroup[];

  try {
    groups = await getNewsletterGroups();
  } catch {
    return <ErrorState title="We could not load this screen">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader
        title="Import subscribers"
        back={{ href: "/admin/newsletter/subscribers", label: "Subscribers" }}
        lede={<>
          A CSV with a header row. Nothing is written until the last step, so you can correct
          the column mapping as many times as you like first.
        </>}
      />

      <ImportWizard groups={groups} />
    </>
  );
}
