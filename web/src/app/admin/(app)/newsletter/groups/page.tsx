import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getNewsletterGroups } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { NewsletterGroup } from "@/types/api";
import { GroupManager } from "./group-manager";

export const metadata = buildMetadata({ title: "Groups", path: "/admin/newsletter/groups", seo: noIndex });

export default async function GroupsPage() {
  let groups: NewsletterGroup[];

  try {
    groups = await getNewsletterGroups();
  } catch {
    return (
      <ErrorState title="We could not load the groups">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Groups"
        back={{ href: "/admin/newsletter", label: "Newsletter" }}
        lede={<>
          Who a campaign is sent to. Somebody can be in as many as you like — a campaign to
          three overlapping groups still sends one email per person.
        </>}
      />

      <GroupManager groups={groups} />
    </>
  );
}
