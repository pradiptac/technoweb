import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Input, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconImage } from "@/components/icons";
import { getGalleryList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { Gallery, Paginated } from "@/types/api";

export const metadata = buildMetadata({ title: "Galleries", path: "/admin/galleries", seo: noIndex });

export default async function AdminGalleriesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; per_page?: string; deleted?: string }>;
}) {
  const params = await searchParams;

  let result: Paginated<Gallery>;
  try {
    result = await getGalleryList({
      q: params.q,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the galleries">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Galleries"
        lede={<>
          Sets of pictures that open full size, optionally grouped into tabs. Each
          one has a shortcode you can paste into any page or article body.
        </>}
      >
        <div className="ml-auto"><ButtonLink href="/admin/galleries/new" size="sm">New gallery</ButtonLink></div>
      </PageHeader>

      {params.deleted && (
        <Alert tone="ok" title="Gallery deleted">
          Anything embedding its shortcode now renders nothing in its place.
        </Alert>
      )}

      <FilterBar action="/admin/galleries">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name…" />
        </FilterField>
        <ButtonLink href="/admin/galleries" variant="ghost" size="sm">Clear</ButtonLink>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconImage />} title="No galleries yet">
          Create one, add pictures, then paste its shortcode wherever it belongs.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[560px] text-[13.5px]">
            <thead>
              <tr className="border-b border-line-strong text-left text-[11.5px] uppercase tracking-[.06em] text-faint">
                <th className="py-2.5 font-semibold">Name</th>
                <th className="py-2.5 font-semibold">Shortcode</th>
                <th className="py-2.5 font-semibold">Pictures</th>
                <th className="py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((gallery) => (
                <tr key={gallery.id} className="border-b border-line last:border-b-0">
                  {/* Every column carries a data-label: below `md` the table
                      becomes cards and an unlabelled cell renders bare. */}
                  <td data-label="Name" className="py-2.5">
                    <Link href={`/admin/galleries/${gallery.id}`} className="font-semibold text-brand-ink hover:underline">
                      {gallery.name}
                    </Link>
                  </td>
                  <td data-label="Shortcode" className="py-2.5">
                    <code className="font-mono text-[12.5px] text-muted select-all">
                      {`[gallery slug="${gallery.slug}"]`}
                    </code>
                  </td>
                  <td data-label="Pictures" className="py-2.5">{gallery.items_count ?? 0}</td>
                  <td data-label="Status" className="py-2.5">
                    <Badge tone={gallery.status === "published" ? "resolved" : "progress"}>
                      {gallery.status ?? "published"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/galleries" params={{ q: params.q, per_page: params.per_page }} />
    </>
  );
}
