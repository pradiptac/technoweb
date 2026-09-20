import Link from "next/link";

import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconShield } from "@/components/icons";
import { getCertificationList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { formatDate } from "@/lib/dates";

export const metadata = buildMetadata({ title: "Certifications", path: "/admin/certifications", seo: noIndex });

const on = (iso: string | null) => formatDate(iso);

export default async function AdminCertificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; per_page?: string }>;
}) {
  const params = await searchParams;

  let result;
  try {
    result = await getCertificationList({
      q: params.q,
      status: params.status,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the certifications">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Certifications"
        lede={<>
          The standards the company is certified to — ISO, MSME, vendor accreditations with a
          certificate behind them. Each appears on <code>/certifications</code>, the About page and
          the homepage while it is published and in date; one past its validity comes off the site
          by itself and is flagged here. Vendor partnerships are set on the brand, under Catalogue.
        </>}
      >
        <div className="ml-auto"><ButtonLink href="/admin/certifications/new" size="sm">New certification</ButtonLink></div>
      </PageHeader>

      <FilterBar action="/admin/certifications">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name or issuer…" />
        </FilterField>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </Select>
        </FilterField>
        <ButtonLink href="/admin/certifications" variant="ghost" size="sm">Clear</ButtonLink>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconShield />} title="No certifications yet">
          Add one with its badge and, if you have it, the certificate as a PDF.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[720px] text-13-5">
            <thead>
              <tr className="border-b border-line-strong text-left text-11-5 uppercase tracking-[.06em] text-faint">
                <th className="py-2.5 font-semibold">Certification</th>
                <th className="py-2.5 font-semibold">Issuer</th>
                <th className="py-2.5 font-semibold">Valid until</th>
                <th className="py-2.5 font-semibold">Order</th>
                <th className="py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-b-0">
                  <td data-label="Certification" className="py-2.5">
                    <Link href={`/admin/certifications/${c.id}`} className="font-semibold text-brand-ink hover:underline">
                      {c.name}
                    </Link>
                    {c.certificate_number && (
                      <span className="mt-0.5 block font-mono text-12 text-muted">{c.certificate_number}</span>
                    )}
                  </td>
                  <td data-label="Issuer" className="py-2.5 text-muted">{c.issuer ?? "—"}</td>
                  <td data-label="Valid until" className="py-2.5 text-muted">
                    {on(c.valid_until)}
                    {c.is_expired && <Badge tone="urgent" className="ml-2">Expired</Badge>}
                  </td>
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
        basePath="/admin/certifications"
        params={{ q: params.q, status: params.status, per_page: params.per_page }}
      />
    </>
  );
}
