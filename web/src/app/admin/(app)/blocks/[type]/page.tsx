import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconLayers } from "@/components/icons";
import { getBlockList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminContentBlock, BlockMeta, Paginated } from "@/types/api";
import { blockType } from "../types";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Blocks", path: "/admin/blocks", seo: noIndex });

/**
 * One kind of content block — CTA banners, stat bars, pricing tables or
 * technology stacks. The kind is in the path (`/admin/blocks/cta`), not a
 * query, so each sidebar row matches its own screens and the console's role
 * gate (`screenRole`, the sidebar's own map) finds a row for every one of
 * them — a `?type=` would have matched none.
 */
export default async function AdminBlocksPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string; per_page?: string }>;
}) {
  await requireScreen();
  const type = blockType((await params).type);
  if (!type) notFound();
  const query = await searchParams;

  let result: Paginated<AdminContentBlock> & { meta: BlockMeta };
  try {
    result = await getBlockList({
      type, q: query.q, status: query.status,
      page: Number(query.page) || 1, per_page: Number(query.per_page) || undefined,
    });
  } catch {
    return <ErrorState title="We could not load the blocks">The admin API is not responding. Try again shortly.</ErrorState>;
  }

  const typeMeta = result.meta.types.find((t) => t.value === type);
  const title = typeMeta?.plural ?? "Blocks";
  const layoutLabel = (layout: string) => result.meta.layouts[type]?.find((l) => l.value === layout)?.label ?? layout;
  const base = `/admin/blocks/${type}`;

  return (
    <>
      <PageHeader
        title={title}
        lede={<>
          Build one once and place it anywhere: paste its shortcode into a page or article body.
          {type === "cta" && <> One published banner can be the <strong>site default</strong> — the closing band at the foot of every page.</>}
          {" "}<Link href={`${base}/showcase`} className="text-brand-ink underline">See them all as the site draws them</Link>.
        </>}
      >
        <div className="ml-auto">
          <ButtonLink href={`${base}/new`} size="sm">New {(typeMeta?.label ?? "block").toLowerCase()}</ButtonLink>
        </div>
      </PageHeader>

      <FilterBar action={base}>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={query.status ?? ""}>
            <option value="">Any</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </Select>
        </FilterField>
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={query.q} placeholder="Name or slug…" />
        </FilterField>
        <ButtonLink href={base} variant="ghost" size="sm">Clear</ButtonLink>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconLayers />} title={`No ${title.toLowerCase()} yet`}>
          Create one, then paste its shortcode wherever it belongs.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[600px] text-13-5">
            <thead>
              <tr className="border-b border-line-strong text-left text-11-5 uppercase tracking-[.06em] text-faint">
                <th className="py-2.5 font-semibold">Name</th>
                <th className="py-2.5 font-semibold">Layout</th>
                <th className="py-2.5 font-semibold">Shortcode</th>
                <th className="py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((block) => (
                <tr key={block.id} className="border-b border-line last:border-b-0">
                  <td data-label="Name" className="py-2.5">
                    <Link href={`${base}/${block.id}`} className="font-semibold text-brand-ink hover:underline">{block.name}</Link>
                    {block.is_default && <Badge tone="brand" className="ml-2">Site default</Badge>}
                  </td>
                  <td data-label="Layout" className="py-2.5">{layoutLabel(block.layout)}</td>
                  <td data-label="Shortcode" className="py-2.5">
                    <code className="font-mono text-12-5 text-muted select-all">{block.shortcode}</code>
                  </td>
                  <td data-label="Status" className="py-2.5">
                    <Badge tone={block.status === "published" ? "resolved" : "progress"}>{block.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath={base} params={{ q: query.q, status: query.status, per_page: query.per_page }} />
    </>
  );
}
