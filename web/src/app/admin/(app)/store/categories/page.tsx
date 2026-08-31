import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { IconLayers } from "@/components/icons";
import { getStoreCategories } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminStoreCategory } from "@/types/api";

export const metadata = buildMetadata({ title: "Store categories", path: "/admin/store/categories", seo: noIndex });

export default async function StoreCategoriesPage() {
  let categories: AdminStoreCategory[];

  try {
    categories = await getStoreCategories();
  } catch {
    return (
      <ErrorState title="We could not load the categories">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Store categories"
        back={{ href: "/admin/store/products", label: "Store products" }}
        lede={<>
          How the shop&rsquo;s listing is arranged. Separate from the site&rsquo;s product categories on
          purpose: one is built for somebody researching a project, the other for somebody buying.
        </>}
      >
        <div className="ml-auto">
          <ButtonLink href="/admin/store/categories/new" size="sm">New category</ButtonLink>
        </div>
      </PageHeader>

      {categories.length === 0 ? (
        <EmptyState icon={<IconLayers />} title="No categories yet">
          Products can be sold without one — a category is a way of arranging the listing, not a
          requirement.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[620px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Category</th>
                <th scope="col" className="px-3 py-1.5">Products</th>
                <th scope="col" className="px-3 py-1.5">Shown</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-b-0">
                  <td data-label="Category" className="px-3 py-2">
                    <Link href={`/admin/store/categories/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <p className="mt-0.5 font-mono text-[12px] text-faint">/{c.slug}</p>
                  </td>
                  <td data-label="Products" className="px-3 py-2 tabular-nums text-muted">{c.product_count ?? 0}</td>
                  <td data-label="Shown" className="px-3 py-2">
                    {c.is_active
                      ? <Badge tone="resolved">Yes</Badge>
                      : <Badge tone="closed">Hidden</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
