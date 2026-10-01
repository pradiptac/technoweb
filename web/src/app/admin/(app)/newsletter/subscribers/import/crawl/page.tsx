import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getNewsletterCrawlStatus, getNewsletterGroups, getNewsletterQueue } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { NewsletterCrawlStatus, NewsletterGroup, QueueHealth } from "@/types/api";
import { CrawlImportWizard } from "./crawl-import-wizard";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({
  title: "Import from a website", path: "/admin/newsletter/subscribers/import/crawl", seo: noIndex,
});

export default async function CrawlImportPage() {
  await requireScreen();
  let groups: NewsletterGroup[];
  let status: NewsletterCrawlStatus;
  let queue: QueueHealth | null;

  try {
    [groups, status, queue] = await Promise.all([
      getNewsletterGroups(),
      getNewsletterCrawlStatus(),
      getNewsletterQueue().catch(() => null),
    ]);
  } catch {
    return <ErrorState title="We could not load this screen">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader
        title="Import from a website"
        back={{ href: "/admin/newsletter/subscribers", label: "Subscribers" }}
        lede={<>
          Read a website to the depth you choose — a trade directory, an association&apos;s member list or one
          company&apos;s own site — and collect the names and addresses it publishes, tagged with an industry.
          Everything found is reviewed by domain before anything is written, and nobody is mailed until you send
          a campaign to them.
        </>}
      />

      <CrawlImportWizard groups={groups} status={status} queue={queue} />
    </>
  );
}
