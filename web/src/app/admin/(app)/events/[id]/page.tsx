import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getEventWithMeta, type AdminEvent, type EventMeta } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { EventForm } from "../event-form";
import { DuplicateEvent } from "../event-row-actions";
import { eventStatusTone } from "../event-tones";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit event", path: `/admin/events/${id}`, seo: noIndex });
}

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen();
  const { id } = await params;

  // Bound by id, never slug: the form changes the slug it would be addressed by.
  if (!/^\d+$/.test(id)) notFound();

  let event: AdminEvent;
  let meta: EventMeta;
  try {
    ({ event, meta } = await getEventWithMeta(Number(id)));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const held = event.counts.confirmed + event.counts.waitlisted + event.counts.cancelled + event.counts.attended;

  return (
    <>
      <PageHeader back={{ href: "/admin/events", label: "All events" }} title="Edit event">
        <Badge tone={eventStatusTone(event.status)}>{event.status_label}</Badge>

        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          {(event.registration_mode === "open" || held > 0) && (
            <Link href={`/admin/events/${event.id}/registrations`} className="py-1 text-13-5 font-semibold text-brand-ink hover:underline">
              Registrations{held > 0 ? ` (${held})` : ""}
            </Link>
          )}
          <DuplicateEvent id={event.id} title={event.title} back={`/admin/events/${event.id}`} />
          {event.status === "published" && (
            <Link href={event.public_path} className="py-1 text-13-5 font-semibold text-brand-ink hover:underline">
              View on site ↗
            </Link>
          )}
        </div>
      </PageHeader>

      {/*
        Keyed on what was last stored, so a successful save mounts a fresh
        form on it — see the note on `EventForm` about a select's default.
        A refused save changes nothing here, so the form stays mounted and
        `<Form>` puts back what was typed.
      */}
      <EventForm key={event.updated_at ?? String(event.id)} event={event} meta={meta} />
    </>
  );
}
