import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconPen } from "@/components/icons";
import { ApiError } from "@/lib/api";
import { getEntries } from "@/lib/admin";
import { formatTableDate } from "@/lib/dates";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  return buildMetadata({ title: "Custom content", path: `/admin/content/${type}`, seo: noIndex });
}

const statusTone = { published: "resolved", draft: "progress", archived: "closed" } as const;

export default async function EntriesPage({
  params, searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string; per_page?: string }>;
}) {
  const { type: slug } = await params;
  const sp = await searchParams;

  let result: Awaited<ReturnType<typeof getEntries>>;
  try {
    result = await getEntries(slug, {
      q: sp.q, status: sp.status, page: Number(sp.page) || 1, per_page: Number(sp.per_page) || undefined,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <ErrorState title="We could not load the entries">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const type = result.meta.type;
  const base = `/admin/content/${type.slug}`;

  return (
    <>
      <PageHeader title={type.plural} back={{ href: "/admin/content", label: "Custom content" }}>
        {!type.is_active && <Badge tone="closed">Switched off</Badge>}
        <div className="ml-auto flex gap-2">
          <ButtonLink href={`/admin/content-types/${type.id}`} size="sm" variant="ghost">Type settings</ButtonLink>
          <ButtonLink href={`${base}/new`} size="sm">New {type.name.toLowerCase()}</ButtonLink>
        </div>
      </PageHeader>

      <FilterBar action={base}>
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={sp.q} placeholder="Title…" />
        </FilterField>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">Any</option>
            {result.meta.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </FilterField>
        <ButtonLink href={base} variant="ghost" size="sm">Clear</ButtonLink>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconPen />} title={`No ${type.plural.toLowerCase()} yet`}
          action={<ButtonLink href={`${base}/new`} size="sm">New {type.name.toLowerCase()}</ButtonLink>} />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[620px] text-13-5">
            <thead>
              <tr className="border-b border-line-strong text-left text-11-5 uppercase tracking-[.06em] text-faint">
                <th className="py-2.5 font-semibold">Title</th>
                <th className="py-2.5 font-semibold">Address</th>
                <th className="py-2.5 font-semibold">Published</th>
                <th className="py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-b-0">
                  <td data-label="Title" className="py-2.5">
                    <Link href={`${base}/${e.id}`} className="font-semibold text-brand-ink hover:underline">{e.title}</Link>
                  </td>
                  <td data-label="Address" className="py-2.5 font-mono text-12-5 text-muted">
                    {e.status === "published" && type.is_active
                      ? <Link href={e.path} className="hover:text-brand-ink hover:underline">{e.path}</Link>
                      : e.path}
                  </td>
                  <td data-label="Published" className="py-2.5">{formatTableDate(e.published_at)}</td>
                  <td data-label="Status" className="py-2.5">
                    <Badge tone={statusTone[e.status]}>{e.status_label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath={base} params={{ q: sp.q, status: sp.status, per_page: sp.per_page }} />
    </>
  );
}
