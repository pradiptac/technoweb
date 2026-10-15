import Link from "next/link";
import type { ReactNode } from "react";
import { FilterBar, FilterField, PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Select } from "@/components/ui/input";
import { getSavedSections } from "@/lib/admin";
import { formatDate } from "@/lib/dates";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import type { SavedSection, TemplateCategory } from "@/types/api";
import { DeleteLibraryButton } from "./delete-button";
import { PreviewLibraryButton } from "./preview-button";

export const metadata = buildMetadata({ title: "Section library", path: "/admin/pages/library", seo: noIndex });

/**
 * The section library and page templates (0.106.0, docs/page-builder.md
 * "The library"). Items are made in the page builder — Save to library on a
 * section, Save as template on a page — and edited and deleted here.
 */
export default async function SectionLibraryPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  await requireScreen();
  const { category } = await searchParams;

  let sections: SavedSection[];
  let templates: SavedSection[];
  let categories: TemplateCategory[];
  let total: number;
  try {
    // The filter is the API's: `?category=` narrows the templates, which are the only items that have one.
    const [s, t, all] = await Promise.all([
      getSavedSections({ kind: "section", per_page: 100 }),
      getSavedSections({ kind: "template", category: category || undefined, per_page: 100 }),
      category ? getSavedSections({ kind: "template", per_page: 1 }) : null,
    ]);
    sections = s.data;
    templates = t.data;
    categories = t.meta.categories ?? [];
    total = sections.length + (all ? all.meta.total : templates.length);
  } catch {
    return (
      <ErrorState title="We could not load the library">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/pages", label: "All pages" }}
        title="Section library"
        lede="Sections and whole pages saved from the page builder. A section placed linked changes on every page when it is edited here; a copy, or a page started from a template, does not."
      >
        <div className="ml-auto">
          <ButtonLink href="/admin/pages/new" size="sm" variant="secondary">New page</ButtonLink>
        </div>
      </PageHeader>

      {total === 0 ? (
        <EmptyState illustration="document" title="Nothing saved yet">
          Open a builder page and press the bookmark on a section to save it here, or Save as template to keep the
          whole page as a starting point.
        </EmptyState>
      ) : (
        <div className="grid gap-8">
          <LibraryTable title="Sections" items={sections} empty="No sections saved yet." />
          <LibraryTable title="Page templates" items={templates} empty={category ? "No page templates in that category." : "No page templates saved yet."}
            filter={categories.length > 0 && (
              <FilterBar action="/admin/pages/library">
                <FilterField label="Template category" htmlFor="category">
                  <Select id="category" name="category" defaultValue={category ?? ""}>
                    <option value="">All categories</option>
                    {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </Select>
                </FilterField>
                <div className="flex gap-2">
                  <Button type="submit" size="sm">Apply</Button>
                  {category && <ButtonLink href="/admin/pages/library" variant="ghost" size="sm">Clear</ButtonLink>}
                </div>
              </FilterBar>
            )} />
        </div>
      )}
    </>
  );
}

function LibraryTable({ title, items, empty, filter }: { title: string; items: SavedSection[]; empty: string; filter?: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-15 font-semibold">{title}</h2>
      {filter}
      {items.length === 0 ? (
        <p className="text-13 text-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[620px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Name</th>
                <th scope="col" className="px-3 py-1.5">Contains</th>
                {items.some((i) => i.kind === "template") && <th scope="col" className="px-3 py-1.5">Category</th>}
                <th scope="col" className="px-3 py-1.5">Saved by</th>
                <th scope="col" className="px-3 py-1.5">Updated</th>
                <th scope="col" className="px-3 py-1.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Name" className="px-3 py-2">
                    <Link href={`/admin/pages/library/${item.id}`} className="block hover:underline">
                      <span className="block text-13-5 font-medium text-ink">{item.name}</span>
                      {item.description && <span className="block text-12-5 text-muted">{item.description}</span>}
                    </Link>
                  </td>
                  <td data-label="Contains" className="px-3 py-2">
                    {item.kind === "section"
                      ? <Badge tone="progress">{item.type_label ?? "Section"}</Badge>
                      : <span className="text-muted">{item.count} section{item.count === 1 ? "" : "s"}</span>}
                  </td>
                  {item.kind === "template" && <td data-label="Category" className="px-3 py-2 text-muted">{item.category_label ?? "—"}</td>}
                  <td data-label="Saved by" className="px-3 py-2 text-muted">{item.author ?? "—"}</td>
                  <td data-label="Updated" className="px-3 py-2 text-muted">{item.updated_at ? formatDate(item.updated_at) : "—"}</td>
                  <td data-label="Actions" className="px-3 py-2 text-right">
                    <span className="inline-flex flex-wrap justify-end gap-1">
                      <PreviewLibraryButton id={item.id} name={item.name} />
                      <DeleteLibraryButton id={item.id} name={item.name} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
