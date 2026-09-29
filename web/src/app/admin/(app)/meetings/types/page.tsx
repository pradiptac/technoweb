import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconGrid } from "@/components/icons";
import { getMeetingTypes } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import type { AdminMeetingTypeIndex } from "@/types/meetings";

export const metadata = buildMetadata({ title: "Meeting types", path: "/admin/meetings/types", seo: noIndex });

/**
 * What a customer can book: a demo, a consultation. Each has a length, the
 * buffers kept free either side, whether the public page offers it, and the
 * hosts allowed to take it. `role:sales_manager`.
 */
export default async function MeetingTypesPage() {
  await requireScreen();

  let result: AdminMeetingTypeIndex;
  try {
    result = await getMeetingTypes();
  } catch {
    return (
      <ErrorState title="We could not load the meeting types">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const types = [...result.data].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        title="Meeting types"
        lede="What people can book, how long it lasts and who may host it. A type with meetings cannot be deleted — switch it off instead, and its meetings are left alone."
      >
        <div className="ml-auto"><ButtonLink href="/admin/meetings/types/new" size="sm">New type</ButtonLink></div>
      </PageHeader>

      {types.length === 0 ? (
        <EmptyState icon={<IconGrid />} title="No meeting types yet">
          Add one — a product demo, a consultation — and the booking page offers it.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[760px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Type</th>
                <th scope="col" className="px-3 py-1.5">Length</th>
                <th scope="col" className="px-3 py-1.5">Hosts</th>
                <th scope="col" className="px-3 py-1.5">Shown</th>
                <th scope="col" className="px-3 py-1.5">Meetings</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Type" className="max-w-[32ch] px-3 py-2">
                    <Link href={`/admin/meetings/types/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                    <span className="block truncate font-mono text-12 text-faint">{t.slug}</span>
                  </td>
                  <td data-label="Length" className="px-3 py-2 whitespace-nowrap">
                    {t.minutes} min
                    {(t.buffer_before > 0 || t.buffer_after > 0) && (
                      <span className="block text-12 text-muted">+{t.buffer_before} / +{t.buffer_after} buffer</span>
                    )}
                  </td>
                  <td data-label="Hosts" className="max-w-[30ch] px-3 py-2 text-muted">
                    {t.host_ids.length === 0
                      ? "Every host"
                      : <span className="block truncate">{t.hosts.map((h) => h.name).join(", ")}</span>}
                    {t.host_ids.length > 0 && t.hosts.every((h) => !h.eligible) && (
                      <span className="block text-12 text-err">None of them can host now</span>
                    )}
                  </td>
                  <td data-label="Shown" className="px-3 py-2">
                    <span className="flex flex-wrap gap-1.5">
                      {t.is_active ? <Badge tone="resolved">On</Badge> : <Badge tone="closed">Off</Badge>}
                      {t.is_public ? <Badge tone="brand" dot={false}>Public</Badge> : <Badge tone="closed" dot={false}>Console only</Badge>}
                    </span>
                  </td>
                  <td data-label="Meetings" className="px-3 py-2">{t.meetings_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
