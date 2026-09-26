import Link from "next/link";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Form } from "@/components/ui/form";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconUsers } from "@/components/icons";
import { getMessageContacts } from "@/lib/admin";
import { formatTableDate } from "@/lib/dates";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { optOutContactAction } from "../actions";
import type { MessageContact, Paginated } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Messaging contacts", path: "/admin/messaging/contacts", seo: noIndex });

type SearchParams = { channel?: string; status?: string; q?: string; page?: string; per_page?: string };

const SOURCES: Record<string, string> = {
  checkout: "Checkout", portal: "Portal", push_bell: "The bell", staff: "Staff", stop: "Replied STOP", unregistered: "Browser unsubscribed",
};

/**
 * Who agreed to be messaged, per channel. There is no "add" — consent is
 * given by the person, at the checkout, in the portal or with the bell —
 * and the one action here records an opt-out said somewhere else.
 */
export default async function MessagingContactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireScreen();
  const params = await searchParams;

  let result: Paginated<MessageContact> & { meta: { channels: { value: string; label: string; active: number }[] } };
  try {
    result = await getMessageContacts({
      channel: params.channel, status: params.status, q: params.q,
      page: Number(params.page) || 1, per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the contacts">
        Messaging is for campaign and store managers. If that is your account, the admin API is not
        responding — try again shortly.
      </ErrorState>
    );
  }

  const filtered = Boolean(params.channel || params.status || params.q);
  const qs = new URLSearchParams(Object.entries({ channel: params.channel, status: params.status, q: params.q, page: params.page })
    .filter((e): e is [string, string] => Boolean(e[1]))).toString();
  const back = `/admin/messaging/contacts${qs ? `?${qs}` : ""}`;

  return (
    <>
      <PageHeader
        title="Contacts"
        lede={<>
          Everybody who opted in to messages on a channel — {result.meta.channels.map((c, i) => (
            <span key={c.value}>{i > 0 && (i === result.meta.channels.length - 1 ? " and " : ", ")}{c.active} on {c.label}</span>
          ))}. A row is the record of their consent, so an opt-out keeps it.
        </>}
      />

      <FilterBar action="/admin/messaging/contacts">
        <div>
          <label htmlFor="channel" className="mb-0.5 block text-11 font-semibold text-faint">Channel</label>
          <Select id="channel" name="channel" defaultValue={params.channel ?? ""}>
            <option value="">Any</option>
            {result.meta.channels.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="status" className="mb-0.5 block text-11 font-semibold text-faint">Status</label>
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any</option>
            <option value="active">Opted in</option>
            <option value="opted_out">Opted out</option>
          </Select>
        </div>
        <div>
          <label htmlFor="q" className="mb-0.5 block text-11 font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q ?? ""} placeholder="Name, email or number" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/messaging/contacts" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconUsers />} title={filtered ? "Nobody matches that filter" : "Nobody has opted in yet"}>
          {filtered ? "Clear the filter to see the rest." : "People opt in with the box under the mobile number at the checkout, in the portal, or with the bell on the shop."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[820px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Address</th>
                <th scope="col" className="px-3 py-1.5">Channel</th>
                <th scope="col" className="px-3 py-1.5">Customer</th>
                <th scope="col" className="px-3 py-1.5">Opted in</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
                <th scope="col" className="px-3 py-1.5"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((c) => (
                <tr key={c.id} className="border-b border-line align-top last:border-b-0">
                  <td data-label="Address" className="px-3 py-2">
                    <span className="font-mono text-12-5 text-ink">{c.address}</span>
                    {c.name && <p className="mt-0.5 text-12 text-muted">{c.name}</p>}
                  </td>
                  <td data-label="Channel" className="px-3 py-2 text-13 text-ink-2">{c.channel_label}</td>
                  <td data-label="Customer" className="px-3 py-2">
                    {c.customer
                      ? <Link href={`/admin/customers/${c.customer.id}`} className="text-13 text-brand-ink hover:underline">{c.customer.name}</Link>
                      : <span className="text-12-5 text-faint">Guest</span>}
                  </td>
                  <td data-label="Opted in" className="px-3 py-2 text-12-5 text-muted">
                    {c.opted_in_at ? formatTableDate(c.opted_in_at) : "—"}
                    {c.source && <span className="block text-12 text-faint">{SOURCES[c.source] ?? c.source}</span>}
                  </td>
                  <td data-label="Status" className="px-3 py-2">
                    <Badge tone={c.is_active ? "resolved" : "closed"}>{c.is_active ? "Opted in" : "Opted out"}</Badge>
                    {!c.is_active && c.opt_out_reason && <span className="mt-0.5 block text-12 text-faint">{SOURCES[c.opt_out_reason] ?? c.opt_out_reason}</span>}
                  </td>
                  <td data-label="Action" className="px-3 py-2 text-right">
                    {c.is_active && (
                      <Form action={optOutContactAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="back" value={back} />
                        <Button type="submit" size="sm" variant="ghost">Record opt-out</Button>
                      </Form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/messaging/contacts" params={{ channel: params.channel, status: params.status, q: params.q, per_page: params.per_page }} />
    </>
  );
}
