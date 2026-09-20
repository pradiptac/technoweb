import Link from "next/link";
import Image from "next/image";

import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconBuilding } from "@/components/icons";
import { getClientList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";

export const metadata = buildMetadata({ title: "Clients", path: "/admin/clients", seo: noIndex });

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; per_page?: string }>;
}) {
  const params = await searchParams;

  let result;
  try {
    result = await getClientList({
      q: params.q,
      status: params.status,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the clients">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Clients"
        lede={<>
          The logo wall — who the company has worked for, with permission. Published clients appear
          on <code>/clients</code>; the featured ones make the homepage strip and the About page.
          This is not the portal customer list, and nothing here reads it.
        </>}
      >
        <div className="ml-auto"><ButtonLink href="/admin/clients/new" size="sm">New client</ButtonLink></div>
      </PageHeader>

      <FilterBar action="/admin/clients">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name…" />
        </FilterField>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </Select>
        </FilterField>
        <ButtonLink href="/admin/clients" variant="ghost" size="sm">Clear</ButtonLink>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconBuilding />} title="No clients yet">
          Add a client with their logo, and tick Featured to put them on the homepage.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[720px] text-13-5">
            <thead>
              <tr className="border-b border-line-strong text-left text-11-5 uppercase tracking-[.06em] text-faint">
                <th className="py-2.5 font-semibold">Client</th>
                <th className="py-2.5 font-semibold">Industry</th>
                <th className="py-2.5 font-semibold">Featured</th>
                <th className="py-2.5 font-semibold">Order</th>
                <th className="py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-b-0">
                  <td data-label="Client" className="py-2.5">
                    <span className="flex items-center gap-3">
                      <span className="relative block size-10 shrink-0 overflow-hidden rounded border border-line bg-surface-2">
                        {c.logo && <Image src={c.logo} alt="" fill unoptimized className="object-contain p-1" />}
                      </span>
                      <Link href={`/admin/clients/${c.id}`} className="font-semibold text-brand-ink hover:underline">
                        {c.name}
                      </Link>
                    </span>
                  </td>
                  <td data-label="Industry" className="py-2.5 text-muted">{c.industry ?? "—"}</td>
                  <td data-label="Featured" className="py-2.5 text-muted">{c.is_featured ? "Yes" : "—"}</td>
                  <td data-label="Order" className="py-2.5">{c.sort_order}</td>
                  <td data-label="Status" className="py-2.5">
                    <Badge tone={c.status === "published" ? "resolved" : "progress"}>{c.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        meta={result.meta}
        basePath="/admin/clients"
        params={{ q: params.q, status: params.status, per_page: params.per_page }}
      />
    </>
  );
}
