import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getNewsletterGroups } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { NewsletterGroup } from "@/types/api";
import { SequenceSettingsForm } from "../sequence-settings-form";

export const metadata = buildMetadata({ title: "New sequence", path: "/admin/newsletter/sequences/new", seo: noIndex });

export default async function NewSequencePage() {
  let groups: NewsletterGroup[];

  try {
    groups = await getNewsletterGroups();
  } catch {
    return <ErrorState title="We could not load the groups">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader
        title="New sequence"
        back={{ href: "/admin/newsletter/sequences", label: "Sequences" }}
        lede={<>
          Name it and say what enrols people. It starts paused: add the steps next, write each
          one in the campaign editor, and switch it on when they are ready.
        </>}
      />

      <SequenceSettingsForm sequence={null} groups={groups} />
    </>
  );
}
