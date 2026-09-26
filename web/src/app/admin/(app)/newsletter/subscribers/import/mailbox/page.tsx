import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getNewsletterGroups, getNewsletterMailboxStatus, getNewsletterQueue } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { NewsletterGroup, NewsletterMailboxStatus, QueueHealth } from "@/types/api";
import { MailboxImportWizard } from "./mailbox-import-wizard";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({
  title: "Import from a mailbox", path: "/admin/newsletter/subscribers/import/mailbox", seo: noIndex,
});

export default async function MailboxImportPage() {
  await requireScreen();
  let groups: NewsletterGroup[];
  let status: NewsletterMailboxStatus;
  let queue: QueueHealth | null;

  try {
    // Together: one screen, three administrator-only reads.
    [groups, status, queue] = await Promise.all([
      getNewsletterGroups(),
      getNewsletterMailboxStatus(),
      getNewsletterQueue().catch(() => null),
    ]);
  } catch {
    return <ErrorState title="We could not load this screen">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader
        title="Import from a mailbox"
        back={{ href: "/admin/newsletter/subscribers", label: "Subscribers" }}
        lede={<>
          Every address the mailbox has written to or copied in — To and Cc, in the Inbox, Sent
          items and every other folder — for the dates you choose, reviewed by domain before
          anything is written. The mailbox is read once and then let go of.
        </>}
      />

      <MailboxImportWizard groups={groups} status={status} queue={queue} />
    </>
  );
}
