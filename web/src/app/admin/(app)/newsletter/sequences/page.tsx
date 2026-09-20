import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { IconMail } from "@/components/icons";
import { getNewsletterSequences } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { NewsletterSequence } from "@/types/api";

export const metadata = buildMetadata({ title: "Sequences", path: "/admin/newsletter/sequences", seo: noIndex });

/**
 * The sequences list.
 *
 * A sequence is a series of messages a subscriber gets on a schedule from
 * the day they join — a welcome series, an onboarding course. Each step is a
 * campaign row under the hood, so the count here is of campaigns nobody
 * sends by hand, and the campaigns list hides them.
 */
export default async function SequencesPage() {
  let sequences: NewsletterSequence[];

  try {
    sequences = await getNewsletterSequences();
  } catch {
    return (
      <ErrorState title="We could not load the sequences">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Sequences"
        back={{ href: "/admin/newsletter", label: "Campaign" }}
        lede={<>
          A series of messages sent to each subscriber on a schedule from the day they join — a
          welcome series, say. A person goes through a sequence once, ever; the scheduler sends
          each step as it falls due.
        </>}
      >
        <div className="ml-auto">
          <ButtonLink href="/admin/newsletter/sequences/new" size="sm">New sequence</ButtonLink>
        </div>
      </PageHeader>

      {sequences.length === 0 ? (
        <EmptyState icon={<IconMail />} title="No sequences yet">
          Make one, add its steps, and switch it on. New subscribers — or new members of the
          group you choose — are enrolled as they arrive.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[640px] text-13">
            <thead>
              <tr className="border-b border-line text-left text-12 uppercase tracking-[.04em] text-muted">
                <th className="py-2 pr-3 font-semibold">Sequence</th>
                <th className="py-2 pr-3 font-semibold">Trigger</th>
                <th className="py-2 pr-3 font-semibold">Steps</th>
                <th className="py-2 pr-3 font-semibold">Enrolled</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {sequences.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <td data-label="Sequence" className="py-2 pr-3">
                    <Link href={`/admin/newsletter/sequences/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                  </td>
                  <td data-label="Trigger" className="py-2 pr-3 text-muted">
                    {s.group ? <>Joins <span className="font-medium text-ink">{s.group.name}</span></> : "Every new subscriber"}
                  </td>
                  <td data-label="Steps" className="py-2 pr-3 tabular-nums">{s.steps_count ?? 0}</td>
                  <td data-label="Enrolled" className="py-2 pr-3 tabular-nums">{(s.active_enrolments ?? 0).toLocaleString()}</td>
                  <td data-label="Status" className="py-2">
                    <Badge tone={s.status === "active" ? "resolved" : "closed"}>{s.status_label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
