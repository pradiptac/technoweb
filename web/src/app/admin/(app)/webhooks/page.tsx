import Link from "next/link";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconPlug } from "@/components/icons";
import { getWebhooks } from "@/lib/admin";
import { formatTableDate } from "@/lib/dates";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminWebhook, Paginated } from "@/types/api";

export const metadata = buildMetadata({ title: "Webhooks", path: "/admin/webhooks", seo: noIndex });

type SearchParams = { active?: string; page?: string; per_page?: string };

export default async function AdminWebhooksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: Paginated<AdminWebhook>;
  try {
    result = await getWebhooks({
      active: params.active, page: Number(params.page) || 1, per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the webhooks">
        This screen is administrator-only. If that is your account, the admin
        API is not responding — try again shortly.
      </ErrorState>
    );
  }

  const hooks = result.data;
  const filtered = Boolean(params.active);

  return (
    <>
      <PageHeader
        title="Webhooks"
        lede={<>
          Other systems told what happened here — a lead, a ticket, an order —
          as a signed POST to a URL of theirs. Each delivery is retried five
          times and logged on the webhook it was for.
        </>}
      >
        <div className="ml-auto"><ButtonLink href="/admin/webhooks/new" size="sm">New webhook</ButtonLink></div>
      </PageHeader>

      <FilterBar action="/admin/webhooks">
        <div>
          <label htmlFor="active" className="mb-0.5 block text-11 font-semibold text-faint">Status</label>
          <Select id="active" name="active" defaultValue={params.active ?? ""}>
            <option value="">Any</option>
            <option value="1">Active</option>
            <option value="0">Switched off</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/webhooks" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {hooks.length === 0 ? (
        <EmptyState icon={<IconPlug />} title={filtered ? "No webhooks match that filter" : "No webhooks yet"}>
          {filtered
            ? "Clear the filter to see the rest."
            : "Add one to have a CRM, a chat channel or an automation told the moment a lead or an order arrives."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[760px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Name</th>
                <th scope="col" className="px-3 py-1.5">Events</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
                <th scope="col" className="px-3 py-1.5">Last delivered</th>
                <th scope="col" className="px-3 py-1.5">Last error</th>
              </tr>
            </thead>
            <tbody>
              {hooks.map((h) => (
                <tr key={h.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Name" className="px-3 py-2">
                    <Link href={`/admin/webhooks/${h.id}`} className="block hover:underline">
                      <span className="text-13-5 font-medium text-ink">{h.name}</span>
                    </Link>
                    <p className="mt-0.5 max-w-[46ch] truncate font-mono text-11-5 text-muted" title={h.url}>{h.url}</p>
                  </td>
                  <td data-label="Events" className="px-3 py-2">
                    <span className="text-13 text-ink-2">{h.events.length} {h.events.length === 1 ? "event" : "events"}</span>
                    <p className="mt-0.5 max-w-[40ch] truncate text-12 text-faint" title={h.event_labels.join(", ")}>
                      {h.event_labels.join(", ")}
                    </p>
                  </td>
                  <td data-label="Status" className="px-3 py-2">
                    <Badge tone={h.is_active ? "resolved" : "closed"}>{h.is_active ? "Active" : "Off"}</Badge>
                  </td>
                  <td data-label="Last delivered" className="px-3 py-2 text-12-5 text-muted">
                    {h.last_delivered_at ? formatTableDate(h.last_delivered_at) : "Never"}
                  </td>
                  <td data-label="Last error" className="px-3 py-2">
                    {h.last_error
                      ? (
                        <span className="block max-w-[36ch]" title={h.last_error}>
                          <Badge tone="urgent" className="max-w-full">
                            <span className="truncate">{h.last_error}</span>
                          </Badge>
                        </span>
                      )
                      : <span className="text-12-5 text-faint">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/webhooks" params={{ active: params.active, per_page: params.per_page }} />
    </>
  );
}
