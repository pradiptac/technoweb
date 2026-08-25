import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Input, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconPen } from "@/components/icons";
import { getFormList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { Paginated, SiteForm } from "@/types/api";

export const metadata = buildMetadata({ title: "Forms", path: "/admin/forms", seo: noIndex });

export default async function AdminFormsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; per_page?: string; deleted?: string }>;
}) {
  const params = await searchParams;

  let result: Paginated<SiteForm>;
  try {
    result = await getFormList({
      q: params.q,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the forms">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Forms"
        lede={<>
          Build a form, then paste its shortcode into any page or article. Submissions are
          stored here and emailed to the address on the form — or to the sales address from
          Settings when it has none.
        </>}
      >
        <div className="ml-auto"><ButtonLink href="/admin/forms/new" size="sm">New form</ButtonLink></div>
      </PageHeader>

      {params.deleted && (
        <Alert tone="ok" title="Form deleted">
          Its submissions were kept. Anything embedding its shortcode now renders nothing.
        </Alert>
      )}

      <FilterBar action="/admin/forms">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name…" />
        </FilterField>
        <ButtonLink href="/admin/forms" variant="ghost" size="sm">Clear</ButtonLink>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconPen />} title="No forms yet">
          Create one, add fields, then paste its shortcode wherever it belongs.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[620px] text-[13.5px]">
            <thead>
              <tr className="border-b border-line-strong text-left text-[11.5px] uppercase tracking-[.06em] text-faint">
                <th className="py-2.5 font-semibold">Name</th>
                <th className="py-2.5 font-semibold">Shortcode</th>
                <th className="py-2.5 font-semibold">Fields</th>
                <th className="py-2.5 font-semibold">Submissions</th>
                <th className="py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((form) => (
                <tr key={form.id} className="border-b border-line last:border-b-0">
                  <td data-label="Name" className="py-2.5">
                    <Link href={`/admin/forms/${form.id}`} className="font-semibold text-brand-600 hover:underline">
                      {form.name}
                    </Link>
                  </td>
                  <td data-label="Shortcode" className="py-2.5">
                    <code className="font-mono text-[12.5px] text-muted select-all">
                      {`[form slug="${form.slug}"]`}
                    </code>
                  </td>
                  <td data-label="Fields" className="py-2.5">{form.fields_count ?? 0}</td>
                  <td data-label="Submissions" className="py-2.5">
                    <Link href={`/admin/forms/${form.id}/submissions`} className="text-brand-600 hover:underline">
                      {form.submissions_count ?? 0}
                    </Link>
                  </td>
                  <td data-label="Status" className="py-2.5">
                    <Badge tone={form.status === "published" ? "resolved" : "progress"}>
                      {form.status ?? "published"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/forms" params={{ q: params.q, per_page: params.per_page }} />
    </>
  );
}
