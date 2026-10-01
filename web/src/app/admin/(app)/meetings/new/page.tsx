import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getMeetings } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { getCurrentStaff } from "@/lib/admin-auth";
import { permits, screenRole } from "../../nav-items";
import { zoneToday } from "../meeting-bits";
import { ScheduleForm } from "./schedule-form";
import type { AdminMeetingIndex } from "@/types/meetings";

export const metadata = buildMetadata({ title: "Schedule a meeting", path: "/admin/meetings/new", seo: noIndex });

/**
 * A meeting booked from the console. The types and hosts it offers are the
 * index's own `meta` — the API's lists, never ones restated here.
 */
export default async function NewMeetingPage({ searchParams }: { searchParams: Promise<{ type?: string; host?: string }> }) {
  await requireScreen();
  const params = await searchParams;

  let index: AdminMeetingIndex;
  try {
    index = await getMeetings({ per_page: 1 });
  } catch {
    return (
      <ErrorState title="We could not open the scheduler">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const host = Number(params.host);
  // Support may open a customer's screen and sales may not; the form offers
  // the link only where it leads somewhere.
  const staff = await getCurrentStaff();
  const canOpenCustomers = Boolean(staff) && permits((staff?.roles ?? []).map((r) => r.slug), screenRole("/admin/customers"));

  return (
    <>
      <PageHeader
        back={{ href: "/admin/meetings", label: "Meetings" }}
        title="Schedule a meeting"
        lede="Book a Google Meet call on somebody's behalf. They are sent an invitation from the company calendar and a confirmation from here."
      />

      <ScheduleForm
        meta={index.meta}
        minDate={zoneToday(index.meta.timezone)}
        preset={{ type: params.type, host: Number.isInteger(host) && host > 0 ? host : null }}
        canOpenCustomers={canOpenCustomers}
      />
    </>
  );
}
