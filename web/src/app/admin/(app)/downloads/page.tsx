import Link from "next/link";
import { BulkBar, RowTick, TickAll } from "@/components/admin/row-selection";
import { bulkDownloadsAction } from "./actions";

import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { SortTh } from "@/components/admin/sort-th";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconLock } from "@/components/icons";
import { getDownloadCategoryList, getDownloadList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { formatDate } from "@/lib/dates";
import { formatBytes } from "@/lib/format-bytes";
import { requireScreen } from "@/lib/admin-screen";
import type { AdminDownloadCategory } from "@/types/downloads";

export const metadata = buildMetadata({ title: "Downloads", path: "/admin/downloads", seo: noIndex });

type Params = {
  q?: string; status?: string; access?: string; category?: string;
  sort?: string; dir?: string; page?: string; per_page?: string;
};

/** The downloads centre's files (docs/downloads.md): what is listed on `/downloads` and on product pages. */
export default async function AdminDownloadsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireScreen();
  const params = await searchParams;

  let result;
  let categories: AdminDownloadCategory[] = [];
  try {
    [result, categories] = await Promise.all([
      getDownloadList({
        q: params.q, status: params.status, access: params.access, category: params.category,
        sort: params.sort, dir: params.dir,
        page: Number(params.page) || 1,
        per_page: Number(params.per_page) || undefined,
      }),
      getDownloadCategoryList().catch(() => [] as AdminDownloadCategory[]),
    ]);
  } catch {
    return (
      <ErrorState title="We could not load the downloads">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const filters = { q: params.q, status: params.status, access: params.access, category: params.category, per_page: params.per_page };
  const sorting = { ...filters, sort: params.sort, dir: params.dir };
  const filtered = Boolean(params.q || params.status || params.access || params.category);

  return (
    <>
      <PageHeader
        title="Downloads"
        lede={<>
          Datasheets, drivers, firmware and guides. Each published file is listed on <code>/downloads</code> under
          its category and on the pages of the products it is attached to. A file can be open to everybody, or
          kept for customers signed in to the portal.
        </>}
      >
        <div className="ml-auto flex flex-wrap gap-2">
          <ButtonLink href="/admin/downloads/categories" variant="secondary" size="sm">Categories</ButtonLink>
          <ButtonLink href="/admin/downloads/new" size="sm">New download</ButtonLink>
        </div>
      </PageHeader>

      <FilterBar action="/admin/downloads">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Title, version or file name…" />
        </FilterField>
        <FilterField label="Category" htmlFor="category">
          <Select id="category" name="category" defaultValue={params.category ?? ""}>
            <option value="">Any</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="none">No category</option>
          </Select>
        </FilterField>
        <FilterField label="Who" htmlFor="access">
          <Select id="access" name="access" defaultValue={params.access ?? ""}>
            <option value="">Anybody</option>
            {result.meta.accesses.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any</option>
            {result.meta.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </FilterField>
        <ButtonLink href="/admin/downloads" variant="ghost" size="sm">Clear</ButtonLink>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState
          illustration="document"
          title={filtered ? "No downloads match" : "No downloads yet"}
          action={filtered ? undefined : <ButtonLink href="/admin/downloads/new" variant="secondary">Add the first one</ButtonLink>}
        >
          {filtered
            ? "Try fewer filters."
            : "Add a datasheet from the media library, or upload a driver or a firmware image. The Downloads link appears in the site's menus once one is published."}
        </EmptyState>
      ) : (
        <>
          <BulkBar scope="downloads" ids={result.data.map((d) => d.id)} noun={{ one: "download", many: "downloads" }} action={bulkDownloadsAction} deleteNote="A file uploaded here goes with its download." />
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[900px] text-13-5">
            <thead>
              <tr className="border-b border-line-strong text-left text-11-5 uppercase tracking-[.06em] text-faint">
                <th scope="col" className="w-8 px-3 py-1.5"><TickAll scope="downloads" ids={result.data.map((d) => d.id)} noun="download" /></th>
                <SortTh sortKey="title" label="Download" basePath="/admin/downloads" params={sorting} sort={params.sort} dir={params.dir} />
                <th className="py-2.5 font-semibold">Category</th>
                <th className="py-2.5 font-semibold">File</th>
                <SortTh sortKey="released" label="Released" basePath="/admin/downloads" params={sorting} sort={params.sort} dir={params.dir} />
                <SortTh sortKey="count" label="Downloads" basePath="/admin/downloads" params={sorting} sort={params.sort} dir={params.dir} />
                <SortTh sortKey="status" label="Status" basePath="/admin/downloads" params={sorting} sort={params.sort} dir={params.dir} />
              </tr>
            </thead>
            <tbody>
              {result.data.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-b-0">
                  <td data-label="Select" className="px-3 py-2"><RowTick scope="downloads" id={d.id} label={d.title} /></td>
                  <td data-label="Download" className="py-2.5">
                    <Link href={`/admin/downloads/${d.id}`} className="font-semibold text-brand-ink hover:underline">
                      {d.title}
                    </Link>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-12 text-muted">
                      {d.version && <span className="font-mono">{d.version}</span>}
                      {d.access === "customers" && (
                        <span className="inline-flex items-center gap-1"><IconLock className="size-3" aria-hidden /> Customers only</span>
                      )}
                      {(d.attached_count ?? 0) > 0 && <span>On {d.attached_count} product{d.attached_count === 1 ? "" : "s"}</span>}
                    </span>
                  </td>
                  <td data-label="Category" className="py-2.5 text-muted">{d.category?.name ?? "—"}</td>
                  <td data-label="File" className="py-2.5 text-muted">
                    {d.file ? (
                      <>
                        <span className="font-mono text-12 uppercase">{d.file.extension ?? "file"}</span>
                        <span className="ml-2">{formatBytes(d.file.size)}</span>
                      </>
                    ) : (
                      <Badge tone="urgent">{d.file_missing ? "File missing" : "No file yet"}</Badge>
                    )}
                  </td>
                  <td data-label="Released" className="py-2.5 text-muted">{d.released_on ? formatDate(d.released_on) : "—"}</td>
                  <td data-label="Downloads" className="py-2.5">{d.download_count.toLocaleString("en-IN")}</td>
                  <td data-label="Status" className="py-2.5">
                    <Badge tone={d.status === "published" ? "resolved" : "progress"}>{d.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <Pagination meta={result.meta} basePath="/admin/downloads" params={sorting} />
    </>
  );
}
