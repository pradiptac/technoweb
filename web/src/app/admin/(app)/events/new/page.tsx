import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getEventMeta, getPageBuilderOptions, type EventMeta } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { EventForm } from "../event-form";

export const metadata = buildMetadata({ title: "New event", path: "/admin/events/new", seo: noIndex });

export default async function NewEventPage() {
  await requireScreen();

  // The formats, statuses and registration modes are the API's lists; a new
  // event has no record to read them off, so the index is asked for its `meta`.
  let meta: EventMeta;
  try {
    meta = await getEventMeta();
  } catch {
    return (
      <ErrorState title="We could not open the editor">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/events", label: "All events" }}
        title="New event"
        lede="Give it a title and a start time and save it as a draft; the venue, the programme and registration can follow. Nothing is on the site until its status is Published."
      />

      <EventForm meta={meta} builder={await getPageBuilderOptions()} />
    </>
  );
}
