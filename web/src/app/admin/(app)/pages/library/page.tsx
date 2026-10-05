import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { getSavedSections } from "@/lib/admin";
import { formatDate } from "@/lib/dates";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import type { SavedSection } from "@/types/api";
import { DeleteLibraryButton } from "./delete-button";

export const metadata = buildMetadata({ title: "Section library", path: "/admin/pages/library", seo: noIndex });

/**
 * The section library and page templates (0.106.0, docs/page-builder.md
 * "The library"). Items are made in the page builder — Save to library on a
 * section, Save as template on a page — and edited and deleted here.
 */
export default async function SectionLibraryPage() {
  await requireScreen();

  let items: SavedSection[];
  try {
    items = (await getSavedSections({ per_page: 100 })).data;
  } catch {
    return (
      <ErrorState title="We could not load the library">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const sections = items.filter((i) => i.kind === "section");
  const templates = items.filter((i) => i.kind === "template");

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

      {items.length === 0 ? (
        <EmptyState illustration="document" title="Nothing saved yet">
          Open a builder page and press the bookmark on a section to save it here, or Save as template to keep the
          whole page as a starting point.
        </EmptyState>
      ) : (
        <div className="grid gap-8">
          <LibraryTable title="Sections" items={sections} empty="No sections saved yet." />
          <LibraryTable title="Page templates" items={templates} empty="No page templates saved yet." />
        </div>
      )}
    </>
  );
}

function LibraryTable({ title, items, empty }: { title: string; items: SavedSection[]; empty: string }) {
  return (
    <section>
      <h2 className="mb-2 text-15 font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="text-13 text-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[620px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Name</th>
                <th scope="col" className="px-3 py-1.5">Contains</th>
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
                  <td data-label="Saved by" className="px-3 py-2 text-muted">{item.author ?? "—"}</td>
                  <td data-label="Updated" className="px-3 py-2 text-muted">{item.updated_at ? formatDate(item.updated_at) : "—"}</td>
                  <td data-label="Actions" className="px-3 py-2 text-right">
                    <DeleteLibraryButton id={item.id} name={item.name} />
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
