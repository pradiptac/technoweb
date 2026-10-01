import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getMeetingTypes } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { MeetingTypeForm } from "../type-form";
import type { AdminMeetingTypeIndex } from "@/types/meetings";

export const metadata = buildMetadata({ title: "New meeting type", path: "/admin/meetings/types/new", seo: noIndex });

export default async function NewMeetingTypePage() {
  await requireScreen();

  let index: AdminMeetingTypeIndex;
  try {
    index = await getMeetingTypes();
  } catch {
    return (
      <ErrorState title="We could not open the editor">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/meetings/types", label: "Meeting types" }} title="New meeting type" />
      <MeetingTypeForm eligible={index.meta.eligible_hosts} />
    </>
  );
}
