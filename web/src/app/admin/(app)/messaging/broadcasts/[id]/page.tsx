import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getMessageBroadcast } from "@/lib/admin";
import { formatTableDate } from "@/lib/dates";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { BroadcastForm, SendPanel } from "../broadcast-form";
import { cancelBroadcastAction, deleteBroadcastAction } from "../../actions";
import { broadcastTone } from "../../tones";
import type { MessageBroadcast, MessageBroadcastMeta } from "@/types/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Broadcast", path: `/admin/messaging/broadcasts/${id}`, seo: noIndex });
}

const percent = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

export default async function BroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let broadcast: MessageBroadcast;
  let meta: MessageBroadcastMeta;
  try {
    ({ data: broadcast, meta } = await getMessageBroadcast(numericId));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const report = broadcast.report;

  return (
    <>
      <PageHeader back={{ href: "/admin/messaging/broadcasts", label: "All broadcasts" }} title={broadcast.name}>
        <Badge tone={broadcastTone(broadcast.status)}>{broadcast.status_label}</Badge>
        <div className="ml-auto flex gap-2">
          {(broadcast.status === "scheduled" || broadcast.status === "sending") && (
            <Form action={cancelBroadcastAction}>
              <input type="hidden" name="id" value={broadcast.id} />
              <Button type="submit" size="sm" variant="warn">Cancel</Button>
            </Form>
          )}
          {(broadcast.status === "draft" || broadcast.status === "cancelled") && (
            <Form action={deleteBroadcastAction}>
              <input type="hidden" name="id" value={broadcast.id} />
              <Button type="submit" size="sm" variant="destructive">Delete</Button>
            </Form>
          )}
        </div>
      </PageHeader>

      {broadcast.status === "draft" && (
        <>
          <BroadcastForm broadcast={broadcast} meta={meta} />
          <SendPanel broadcast={broadcast} meta={meta} />
        </>
      )}

      {broadcast.status === "scheduled" && (
        <Card interactive={false} padding="md">
          <p className="text-13-5 text-ink">
            Scheduled for {broadcast.scheduled_at ? formatTableDate(broadcast.scheduled_at) : "—"} to{" "}
            {broadcast.template?.name ?? "no template"} · {broadcast.audience_label} ({broadcast.audience_count ?? 0} now).
            Cancel it to change anything.
          </p>
        </Card>
      )}

      {report && (
        <>
          <dl className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Recipients", String(broadcast.recipient_count)],
              ["Sent", String(report.sent)],
              ["Delivered", String(report.counts.delivered + report.counts.read)],
              ["Read", String(report.counts.read)],
              ["Failed", String(report.counts.failed)],
              ["Waiting", String(report.counts.pending)],
            ].map(([label, value]) => (
              <Card key={label} interactive={false} padding="sm">
                <dt className="text-12 text-muted">{label}</dt>
                <dd className="mt-1 text-22 font-semibold text-ink">{value}</dd>
              </Card>
            ))}
          </dl>
          <p className="mb-4 text-12-5 text-muted">
            Delivery rate {percent(report.delivery_rate)}, read rate {percent(report.read_rate)} — as the provider has reported
            them so far; a provider that sends no receipts leaves these at sent.
            {report.counts.skipped > 0 && ` ${report.counts.skipped} skipped: opted out, cancelled or the template lost its approval before its turn.`}
          </p>

          {report.failures.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
              <table className="admin-table w-full min-w-[620px] text-left text-13">
                <caption className="px-3 py-2 text-left text-13-5 font-semibold text-ink">Latest failures</caption>
                <thead>
                  <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                    <th scope="col" className="px-3 py-1.5">Address</th>
                    <th scope="col" className="px-3 py-1.5">What the provider said</th>
                    <th scope="col" className="px-3 py-1.5">When</th>
                  </tr>
                </thead>
                <tbody>
                  {report.failures.map((f) => (
                    <tr key={f.id} className="border-b border-line align-top last:border-b-0">
                      <td data-label="Address" className="px-3 py-2 font-mono text-12-5">{f.address.length > 24 ? `${f.address.slice(0, 12)}…` : f.address}</td>
                      <td data-label="What the provider said" className="px-3 py-2 text-12-5 text-ink-2">{f.error ?? "—"}</td>
                      <td data-label="When" className="px-3 py-2 text-12-5 text-muted">{f.at ? formatTableDate(f.at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
