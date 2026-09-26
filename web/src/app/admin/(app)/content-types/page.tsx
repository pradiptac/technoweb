import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconGrid } from "@/components/icons";
import { getContentTypeList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Content types", path: "/admin/content-types", seo: noIndex });

export default async function ContentTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; per_page?: string }>;
}) {
  await requireScreen();
  const params = await searchParams;

  let result: Awaited<ReturnType<typeof getContentTypeList>>;
  try {
    result = await getContentTypeList({ page: Number(params.page) || 1, per_page: Number(params.per_page) || undefined });
  } catch {
    return (
      <ErrorState title="We could not load the content types">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Content types"
        lede={<>
          New kinds of content with pages of their own — events, downloads, partners. Each type
          has an address (<code className="font-mono text-12-5">/events</code>), an archive listing its
          entries, and a page per entry. Add fields to a type from Custom fields.
        </>}
      >
        <div className="ml-auto"><ButtonLink href="/admin/content-types/new" size="sm">New content type</ButtonLink></div>
      </PageHeader>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconGrid />} title="No content types yet">
          Create one, then add its entries under Custom content.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[620px] text-13-5">
            <thead>
              <tr className="border-b border-line-strong text-left text-11-5 uppercase tracking-[.06em] text-faint">
                <th className="py-2.5 font-semibold">Type</th>
                <th className="py-2.5 font-semibold">Address</th>
                <th className="py-2.5 font-semibold">Entries</th>
                <th className="py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((type) => (
                <tr key={type.id} className="border-b border-line last:border-b-0">
                  <td data-label="Type" className="py-2.5">
                    <Link href={`/admin/content-types/${type.id}`} className="font-semibold text-brand-ink hover:underline">
                      {type.plural}
                    </Link>
                  </td>
                  <td data-label="Address" className="py-2.5 font-mono text-12-5 text-muted">{type.path}</td>
                  <td data-label="Entries" className="py-2.5">
                    <Link href={`/admin/content/${type.slug}`} className="text-brand-ink hover:underline">
                      {type.published_count ?? 0} published of {type.entries_count ?? 0}
                    </Link>
                  </td>
                  <td data-label="Status" className="py-2.5">
                    <Badge tone={type.is_active ? "resolved" : "closed"}>{type.is_active ? "On" : "Off"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/content-types" params={{ per_page: params.per_page }} />
    </>
  );
}
