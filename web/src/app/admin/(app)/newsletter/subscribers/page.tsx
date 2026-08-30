import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconUsers } from "@/components/icons";
import { getNewsletterGroups, getNewsletterSubscribers } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { SubscriberIndex } from "@/lib/admin";
import type { NewsletterGroup } from "@/types/api";
import { SubscriberRow } from "./subscriber-row";
import { AddSubscriber } from "./add-subscriber";

export const metadata = buildMetadata({ title: "Subscribers", path: "/admin/newsletter/subscribers", seo: noIndex });

export default async function SubscribersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; group?: string; page?: string; per_page?: string }>;
}) {
  const params = await searchParams;

  let result: SubscriberIndex;
  let groups: NewsletterGroup[];

  try {
    [result, groups] = await Promise.all([
      getNewsletterSubscribers({
        q: params.q,
        status: params.status,
        group: params.group,
        page: Number(params.page) || 1,
        per_page: Number(params.per_page) || undefined,
      }),
      getNewsletterGroups(),
    ]);
  } catch {
    return (
      <ErrorState title="We could not load the subscribers">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const rows = result.data;
  const filtered = Boolean(params.q || params.status || params.group);

  return (
    <>
      <PageHeader
        title="Subscribers"
        back={{ href: "/admin/newsletter", label: "Newsletter" }}
        lede={<>
          Everybody who can receive a campaign, and everybody who used to. Nothing is deleted
          when somebody unsubscribes — the record stays so a later import cannot put them back.
        </>}
      >
        <div className="ml-auto flex gap-2">
          {/*
            Named after the formats rather than after the action.

            It said "Import CSV", then "Import a file" once Excel was
            supported — which was more accurate and less findable, because
            somebody looking for the CSV import searches the screen for the
            word CSV. Both formats are in the label now.
          */}
          <ButtonLink href="/admin/newsletter/subscribers/import" variant="secondary" size="sm">
            Import CSV or Excel
          </ButtonLink>
          {/*
            A plain anchor, **not** `ButtonLink` — and this was measured rather
            than reasoned about.

            `next/link` prefetches whatever is in the viewport, so a Link
            pointing at the export route made the server build a complete CSV
            of the whole list on every visit to this screen. Nobody would ever
            see it: the response was fetched, cached and thrown away. A route
            handler is not a page, so there is nothing for a prefetch to be
            useful for and everything for it to cost.

            `download` also means the browser saves it rather than trying to
            navigate to a text/csv response.
          */}
          <a
            href={`/api/admin/newsletter/export${params.status ? `?status=${params.status}` : ""}`}
            download
            className="inline-flex min-h-[34px] items-center rounded border border-line-strong bg-card px-3 text-[13px] font-semibold shadow-1 hover:border-faint"
          >
            Export
          </a>
        </div>
      </PageHeader>

      <AddSubscriber groups={groups} />

      <FilterBar action="/admin/newsletter/subscribers">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Email, name or company…" />
        </FilterField>

        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option>
            {result.meta.statuses.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="Group" htmlFor="group">
          <Select id="group" name="group" defaultValue={params.group ?? ""}>
            <option value="">Any group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </FilterField>

        <div className="flex gap-2">
          <button type="submit" className="rounded border border-brand-600 bg-brand-600 px-3 text-[13px] font-semibold text-white hover:bg-brand-700">
            Apply
          </button>
          {filtered && (
            <ButtonLink href="/admin/newsletter/subscribers" variant="ghost" size="sm">Clear</ButtonLink>
          )}
        </div>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState icon={<IconUsers />} title={filtered ? "Nothing matches" : "No subscribers yet"}>
          {filtered ? "Try a different term, or clear the filters." : (
            <>
              There are three ways to add people:{" "}
              <Link href="/admin/newsletter/subscribers/import" className="font-semibold text-brand-ink underline">
                import a CSV or Excel file
              </Link>
              , paste a list of addresses, or bring your existing customers across — the last
              two are the buttons above.
            </>
          )}
        </EmptyState>
      ) : (
        <table className="admin-table w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] uppercase tracking-[.04em] text-muted">
              <th className="py-2 pr-3 font-semibold">Email</th>
              <th className="py-2 pr-3 font-semibold">Name</th>
              <th className="py-2 pr-3 font-semibold">Groups</th>
              <th className="py-2 pr-3 font-semibold">Status</th>
              <th className="py-2 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => <SubscriberRow key={s.id} subscriber={s} />)}
          </tbody>
        </table>
      )}

      <Pagination
        meta={result.meta}
        basePath="/admin/newsletter/subscribers"
        params={{ q: params.q, status: params.status, group: params.group, per_page: params.per_page }}
      />

      {result.meta.total_suppressed > 0 && (
        <div className="mt-4">
          <Alert tone="info" title={`${result.meta.total_suppressed} addresses are on the do-not-mail list`}>
          They are excluded from every campaign whatever their status here, and an import
            cannot put them back. See <Link href="/admin/newsletter/unsubscribes" className="font-semibold underline">Unsubscribes</Link>.
          </Alert>
        </div>
      )}
    </>
  );
}
