import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Input, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconImage } from "@/components/icons";
import { getSliderList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { Paginated, Slider } from "@/types/api";

export const metadata = buildMetadata({ title: "Sliders", path: "/admin/sliders", seo: noIndex });

export default async function AdminSlidersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; per_page?: string; deleted?: string }>;
}) {
  const params = await searchParams;

  let result: Paginated<Slider>;
  try {
    result = await getSliderList({
      q: params.q,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the sliders">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Sliders"
        lede={<>
          Carousels of images, video files and YouTube links. Each one has a shortcode you
          can paste into any page or article body, and the homepage hero uses the slider
          named <code className="font-mono text-[12.5px]">homepage-hero</code>.
        </>}
      >
        <div className="ml-auto"><ButtonLink href="/admin/sliders/new" size="sm">New slider</ButtonLink></div>
      </PageHeader>

      {params.deleted && (
        <Alert tone="ok" title="Slider deleted">
          Anything embedding its shortcode now renders nothing in its place.
        </Alert>
      )}

      <FilterBar action="/admin/sliders">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name…" />
        </FilterField>
        <ButtonLink href="/admin/sliders" variant="ghost" size="sm">Clear</ButtonLink>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconImage />} title="No sliders yet">
          Create one, add slides, then paste its shortcode wherever it belongs.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[560px] text-[13.5px]">
            <thead>
              <tr className="border-b border-line-strong text-left text-[11.5px] uppercase tracking-[.06em] text-faint">
                <th className="py-2.5 font-semibold">Name</th>
                <th className="py-2.5 font-semibold">Shortcode</th>
                <th className="py-2.5 font-semibold">Slides</th>
                <th className="py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((slider) => (
                <tr key={slider.id} className="border-b border-line last:border-b-0">
                  <td data-label="Name" className="py-2.5">
                    <Link href={`/admin/sliders/${slider.id}`} className="font-semibold text-brand-ink hover:underline">
                      {slider.name}
                    </Link>
                  </td>
                  <td data-label="Shortcode" className="py-2.5">
                    <code className="font-mono text-[12.5px] text-muted select-all">
                      {`[slider slug="${slider.slug}"]`}
                    </code>
                  </td>
                  <td data-label="Slides" className="py-2.5">{slider.slides_count ?? 0}</td>
                  <td data-label="Status" className="py-2.5">
                    <Badge tone={slider.status === "published" ? "resolved" : "progress"}>
                      {slider.status ?? "published"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/sliders" params={{ q: params.q, per_page: params.per_page }} />
    </>
  );
}
