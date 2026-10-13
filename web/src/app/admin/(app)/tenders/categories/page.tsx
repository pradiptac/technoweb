import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { getTenderCategories } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import type { AdminTenderCategory } from "@/lib/admin";

export const metadata = buildMetadata({ title: "Tender categories", path: "/admin/tenders/categories", seo: noIndex });

/** What kind of work a tender is for (docs/tenders.md). */
export default async function TenderCategoriesPage() {
  await requireScreen();

  let categories: AdminTenderCategory[];
  try {
    categories = (await getTenderCategories()).data;
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
        back={{ href: "/admin/tenders", label: "All tenders" }}
        title="Tender categories"
        lede="What the Tenders page filters by, in this order. A category with nothing published in it is not offered as a filter."
      >
        <div className="ml-auto"><ButtonLink href="/admin/tenders/categories/new" size="sm">New category</ButtonLink></div>
      </PageHeader>

      {categories.length === 0 ? (
        <EmptyState
          illustration="document"
          title="No categories yet"
          action={<ButtonLink href="/admin/tenders/categories/new" variant="secondary">Add the first one</ButtonLink>}
        >
          Networking, Hardware supply and Annual maintenance are the usual sort. A tender can be published without one.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[640px] text-13-5">
            <thead>
              <tr className="border-b border-line-strong text-left text-11-5 uppercase tracking-[.06em] text-faint">
                <th className="py-2.5 font-semibold">Category</th>
                <th className="py-2.5 font-semibold">Tenders</th>
                <th className="py-2.5 font-semibold">Order</th>
                <th className="py-2.5 font-semibold">Shown</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-b-0">
                  <td data-label="Category" className="py-2.5">
                    <Link href={`/admin/tenders/categories/${c.id}`} className="font-semibold text-brand-ink hover:underline">
                      {c.name}
                    </Link>
                    <span className="mt-0.5 block font-mono text-12 text-muted">{c.slug}</span>
                  </td>
                  <td data-label="Tenders" className="py-2.5">
                    {c.tenders_count > 0 ? (
                      <Link href={`/admin/tenders?category=${c.id}`} className="text-brand-ink hover:underline">{c.tenders_count}</Link>
                    ) : "0"}
                  </td>
                  <td data-label="Order" className="py-2.5">{c.sort_order}</td>
                  <td data-label="Shown" className="py-2.5">
                    <Badge tone={c.is_active ? "resolved" : "progress"}>{c.is_active ? "Shown" : "Switched off"}</Badge>
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
