import Link from "next/link";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconMegaphone } from "@/components/icons";
import { getMessageBroadcasts } from "@/lib/admin";
import { formatTableDate } from "@/lib/dates";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { broadcastTone } from "../tones";
import type { MessageBroadcast, MessageBroadcastMeta, Paginated } from "@/types/api";

export const metadata = buildMetadata({ title: "Broadcasts", path: "/admin/messaging/broadcasts", seo: noIndex });

type SearchParams = { status?: string; page?: string; per_page?: string };

export default async function BroadcastsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  let result: Paginated<MessageBroadcast> & { meta: MessageBroadcastMeta };
  try {
    result = await getMessageBroadcasts({ status: params.status, page: Number(params.page) || 1, per_page: Number(params.per_page) || undefined });
  } catch {
    return (
      <ErrorState title="We could not load the broadcasts">
        Messaging is for campaign and store managers. If that is your account, the admin API is not
        responding — try again shortly.
      </ErrorState>
    );
  }

  const filtered = Boolean(params.status);

  return (
    <>
      <PageHeader
        title="Broadcasts"
        lede={<>
          One template to everybody opted in on a channel — or a slice of them. Broadcasts are
          promotional: they go out only between {result.meta.quiet_hours.start} and {result.meta.quiet_hours.end}, in batches,
          and a message sent cannot be recalled.
        </>}
      >
        <div className="ml-auto"><ButtonLink href="/admin/messaging/broadcasts/new" size="sm">New broadcast</ButtonLink></div>
      </PageHeader>

      <FilterBar action="/admin/messaging/broadcasts">
        <div>
          <label htmlFor="status" className="mb-0.5 block text-11 font-semibold text-faint">Status</label>
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any</option>
            {result.meta.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/messaging/broadcasts" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconMegaphone />} title={filtered ? "No broadcasts match that filter" : "No broadcasts yet"}>
          {filtered ? "Clear the filter to see the rest." : "Write a template first, then send it to the people who opted in on its channel."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[760px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Broadcast</th>
                <th scope="col" className="px-3 py-1.5">Channel</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
                <th scope="col" className="px-3 py-1.5">Recipients</th>
                <th scope="col" className="px-3 py-1.5">When</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((b) => (
                <tr key={b.id} className="border-b border-line align-top last:border-b-0">
                  <td data-label="Broadcast" className="px-3 py-2">
                    <Link href={`/admin/messaging/broadcasts/${b.id}`} className="block hover:underline">
                      <span className="text-13-5 font-medium text-ink">{b.name}</span>
                    </Link>
                    <p className="mt-0.5 text-12 text-muted">{b.template?.name ?? "No template"} · {b.audience_label}</p>
                  </td>
                  <td data-label="Channel" className="px-3 py-2 text-13 text-ink-2">{b.channel_label}</td>
                  <td data-label="Status" className="px-3 py-2"><Badge tone={broadcastTone(b.status)}>{b.status_label}</Badge></td>
                  <td data-label="Recipients" className="px-3 py-2 text-13 text-ink-2">{b.status === "draft" || b.status === "scheduled" ? "—" : b.recipient_count}</td>
                  <td data-label="When" className="px-3 py-2 text-12-5 text-muted">
                    {b.completed_at ? formatTableDate(b.completed_at) : b.started_at ? formatTableDate(b.started_at) : b.scheduled_at ? formatTableDate(b.scheduled_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/messaging/broadcasts" params={{ status: params.status, per_page: params.per_page }} />
    </>
  );
}
