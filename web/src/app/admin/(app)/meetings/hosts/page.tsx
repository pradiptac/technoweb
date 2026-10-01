import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Alert } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconUsers } from "@/components/icons";
import { getMeetingHosts } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { HostHoursEditor, HostTimeOff } from "./host-panels";
import type { MeetingHostIndex } from "@/types/meetings";

export const metadata = buildMetadata({ title: "Meeting hosts", path: "/admin/meetings/hosts", seo: noIndex });

const FREE_BUSY: Record<string, { tone: "resolved" | "urgent" | "closed"; label: string }> = {
  visible: { tone: "resolved", label: "Google free/busy visible" },
  unknown: { tone: "urgent", label: "Google cannot see their calendar" },
  not_connected: { tone: "closed", label: "Google not connected" },
};

/**
 * Who can be booked, and when. A host is a staff account holding the
 * Meeting host role — ticked on the Staff form, not here — and this screen
 * sets each one's weekly hours and time off. `role:admin`: it decides when
 * a colleague can be booked.
 */
export default async function MeetingHostsPage() {
  await requireScreen();

  let result: MeetingHostIndex;
  try {
    result = await getMeetingHosts();
  } catch {
    return (
      <ErrorState title="We could not load the hosts">
        This screen is administrator-only. If that is your account, the admin API is not responding — try again shortly.
      </ErrorState>
    );
  }

  const unknown = result.data.filter((h) => h.free_busy === "unknown");

  return (
    <>
      <PageHeader
        title="Meeting hosts"
        lede={<>
          The staff who can be booked for a meeting, their weekly hours and their time off. Somebody becomes a host
          when the <strong>Meeting host</strong> role is ticked on their account in{" "}
          <Link href="/admin/users" className="text-brand-ink underline">Staff</Link>. Times are in {result.meta.timezone_label}.
        </>}
      />

      {unknown.length > 0 && (
        <Alert tone="warn" title="Google cannot see some hosts' calendars" dismissible={false}>
          {unknown.map((h) => h.name).join(", ")} {unknown.length === 1 ? "has" : "have"} not shared free/busy with the
          connected account, so busy time in their own calendar does not block bookings. In Google Calendar each of them
          opens Settings → their calendar → Share with specific people, adds the meetings account and chooses
          “See only free/busy”.
        </Alert>
      )}

      {result.data.length === 0 ? (
        <EmptyState icon={<IconUsers />} title="No hosts yet">
          Tick the Meeting host role on a staff account in Staff, and they appear here to be given hours.
        </EmptyState>
      ) : (
        <ul className="grid gap-4">
          {result.data.map((host) => {
            const fb = FREE_BUSY[host.free_busy] ?? FREE_BUSY.not_connected;

            return (
              <li key={host.id}>
                <Card as="section" interactive={false} padding="sm">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h2 className="text-15 font-semibold">{host.name}</h2>
                    <span className="text-12-5 text-muted">{host.email}</span>
                    <span className="ml-auto flex flex-wrap gap-1.5">
                      {!host.is_active && <Badge tone="closed">Inactive</Badge>}
                      <Badge tone={fb.tone}>{fb.label}</Badge>
                      <Badge tone="brand" dot={false}>{host.upcoming_count} upcoming</Badge>
                    </span>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                    <div className="min-w-0">
                      <h3 className="mb-2 text-12 font-semibold uppercase tracking-[.06em] text-faint">Weekly hours</h3>
                      <HostHoursEditor host={host} defaults={result.meta.default_hours} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="mb-2 text-12 font-semibold uppercase tracking-[.06em] text-faint">Time off</h3>
                      <HostTimeOff host={host} />
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
