import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconBook } from "@/components/icons";
import { getBlogCategoryList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";

export const metadata = buildMetadata({
  title: "Blog categories",
  path: "/admin/blog-categories",
  seo: noIndex,
});

type SearchParams = { q?: string; page?: string; per_page?: string };

export default async function BlogCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const list = await getBlogCategoryList({
    q: params.q,
    page: params.page ? Number(params.page) : undefined,
    per_page: params.per_page ? Number(params.per_page) : undefined,
  }).catch(() => null);

  if (!list) {
    return (
      <ErrorState title="We could not load the categories">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Blog categories"
        lede="What an article can be filed under. They drive the badges on every card, the strip above the blog and the sidebar — and a category with nothing published in it is hidden from all three rather than shown empty."
      >
        <ButtonLink href="/admin/blog-categories/new" className="ml-auto">New category</ButtonLink>
      </PageHeader>

      <FilterBar action="/admin/blog-categories">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q ?? ""} placeholder="Name…" className="w-[220px]" />
        </FilterField>
        <Button type="submit" className="mb-[1px]">Filter</Button>
      </FilterBar>

      {list.data.length === 0 ? (
        <EmptyState icon={<IconBook />} title="No categories yet">
          Add one, then file articles under it from the post editor.
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
            <table className="admin-table w-full min-w-[620px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] text-faint">
                  <th className="py-2 pr-3 pl-4 font-semibold">Name</th>
                  <th className="py-2 pr-3 font-semibold">Slug</th>
                  <th className="py-2 pr-3 text-right font-semibold">Posts</th>
                  <th className="py-2 pr-4 text-right font-semibold">Order</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((category) => (
                  <tr key={category.id} className="border-b border-line last:border-0">
                    {/*
                      Every cell carries a `data-label`, because below `md` this
                      table becomes cards and the label is what names the value.
                      A column added without one renders unlabelled on a phone.
                    */}
                    <td data-label="Name" className="max-w-[36ch] truncate py-2 pr-3 pl-4 font-medium">
                      <Link href={`/admin/blog-categories/${category.id}`} className="hover:text-brand-ink">
                        {category.name}
                      </Link>
                    </td>
                    <td data-label="Slug" className="max-w-[30ch] truncate py-2 pr-3 font-mono text-[12.5px] text-muted">
                      {category.slug}
                    </td>
                    <td data-label="Posts" className="py-2 pr-3 text-right tabular-nums">
                      {category.posts_count ?? 0}
                    </td>
                    <td data-label="Order" className="py-2 pr-4 text-right tabular-nums text-muted">
                      {category.sort_order}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination meta={list.meta} basePath="/admin/blog-categories" params={{ ...params }} />
        </>
      )}
    </>
  );
}
