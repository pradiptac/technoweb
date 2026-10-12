import Link from "next/link";

import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { EmptyListAction } from "@/components/admin/empty-list-action";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconMapPin } from "@/components/icons-ui";
import { getSupportCentreList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Support network", path: "/admin/support-centres", seo: noIndex });

/** The support network's centres (0.170.0, docs/support-network.md). */
export default async function AdminSupportCentresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; country?: string; active?: string; page?: string; per_page?: string }>;
}) {
  await requireScreen();
  const params = await searchParams;
  const filtered = Boolean(params.q || params.country || params.active);

  let result;
  try {
    result = await getSupportCentreList({
      q: params.q, country: params.country, active: params.active,
      page: Number(params.page) || 1, per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return <ErrorState title="We could not load the support network">The admin API is not responding. Try again shortly.</ErrorState>;
  }

  return (
    <>
      <PageHeader
        title="Support network"
        lede={<>
          Your service centres and offices — address, telephone and a pin on the map — listed country by
          country on <code>/support-network</code>, and the staff who work at each. Tag staff here; a name marked
          “On the website” is shown on the centre’s card, never an email or mobile.
        </>}
      >
        <div className="ml-auto flex gap-2">
          <ButtonLink href="/support-network" variant="ghost" size="sm" target="_blank">View page</ButtonLink>
          <ButtonLink href="/admin/support-centres/new" size="sm">New centre</ButtonLink>
        </div>
      </PageHeader>

      <FilterBar action="/admin/support-centres">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name, city or state…" />
        </FilterField>
        <FilterField label="Country" htmlFor="country">
          <Select id="country" name="country" defaultValue={params.country ?? ""}>
            <option value="">Any</option>
            {result.meta.countries.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Shown" htmlFor="active">
          <Select id="active" name="active" defaultValue={params.active ?? ""}>
            <option value="">Any</option>
            <option value="1">Shown</option>
            <option value="0">Hidden</option>
          </Select>
        </FilterField>
        <ButtonLink href="/admin/support-centres" variant="ghost" size="sm">Clear</ButtonLink>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<IconMapPin />}
          title={filtered ? "No centres match those filters" : "No centres yet"}
          action={<EmptyListAction filtered={filtered} clearHref="/admin/support-centres" newHref="/admin/support-centres/new" noun="centre" />}
        >
          Add a centre with its address and telephone, and press the map where it is.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[720px] text-13-5">
            <thead>
              <tr className="border-b border-line-strong text-left text-11-5 uppercase tracking-[.06em] text-faint">
                <th className="py-2.5 font-semibold">Centre</th>
                <th className="py-2.5 font-semibold">City</th>
                <th className="py-2.5 font-semibold">Country</th>
                <th className="py-2.5 font-semibold">Staff</th>
                <th className="py-2.5 font-semibold">Pin</th>
                <th className="py-2.5 font-semibold">Shown</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-b-0">
                  <td data-label="Centre" className="py-2.5">
                    <Link href={`/admin/support-centres/${c.id}`} className="font-semibold text-brand-ink hover:underline">{c.name}</Link>
                    <span className="mt-0.5 block text-12 text-muted">{c.kind_label}</span>
                  </td>
                  <td data-label="City" className="py-2.5">{c.city}{c.region ? <span className="text-muted">, {c.region}</span> : null}</td>
                  <td data-label="Country" className="py-2.5 text-muted">{c.country}</td>
                  <td data-label="Staff" className="py-2.5">
                    {c.staff_count ? <Link href={`/admin/users?centre=${c.id}`} className="text-brand-ink hover:underline">{c.staff_count}</Link> : <span className="text-muted">—</span>}
                  </td>
                  <td data-label="Pin" className="py-2.5 text-muted">{c.latitude !== null && c.longitude !== null ? "Placed" : "None"}</td>
                  <td data-label="Shown" className="py-2.5">
                    <Badge tone={c.is_active ? "resolved" : "progress"}>{c.is_active ? "Shown" : "Hidden"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        meta={result.meta}
        basePath="/admin/support-centres"
        params={{ q: params.q, country: params.country, active: params.active, per_page: params.per_page }}
      />
    </>
  );
}
