import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getMeetingType, getMeetingTypes } from "@/lib/admin";
import { ApiError } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { MeetingTypeForm } from "../type-form";
import type { AdminMeetingType, AdminMeetingTypeIndex } from "@/types/meetings";

export const metadata = buildMetadata({ title: "Meeting type", path: "/admin/meetings/types", seo: noIndex });

export default async function MeetingTypePage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();

  let type: AdminMeetingType;
  let index: AdminMeetingTypeIndex;
  try {
    [type, index] = await Promise.all([getMeetingType(id), getMeetingTypes()]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();

    return (
      <ErrorState title="We could not load that meeting type">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/meetings/types", label: "Meeting types" }} title={type.name} />
      <MeetingTypeForm key={type.updated_at ?? type.id} type={type} eligible={index.meta.eligible_hosts} />
    </>
  );
}
