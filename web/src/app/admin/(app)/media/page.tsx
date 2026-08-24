import Link from "next/link";
import { FilterBar } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconImage } from "@/components/icons";
import { getMediaFolders, getMediaList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";
import { MediaUploader } from "./media-uploader";
import { FolderRail } from "./folder-rail";
import { MediaGrid } from "./media-grid";
import type { MediaFolder, MediaItem, Paginated } from "@/types/api";

export const metadata = buildMetadata({ title: "Media", path: "/admin/media", seo: noIndex });

type SearchParams = {
  q?: string;
  page?: string;
  folder?: string;
  kind?: string;
  deleted?: string;
  folder_deleted?: string;
};

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const kind = params.kind === "file" ? "file" : "image";

  let result: Paginated<MediaItem>;
  let folders: MediaFolder[];
  try {
    [result, folders] = await Promise.all([
      getMediaList({
        q: params.q,
        page: Number(params.page) || 1,
        folder: params.folder,
        kind,
      }),
      getMediaFolders(),
    ]);
  } catch {
    return (
      <ErrorState title="We could not load the media library">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const items = result.data;

  // Carried through every action so deleting the fourth file in a folder
  // leaves you in that folder rather than back at the top of everything.
  const returnTo = new URLSearchParams(
    Object.entries({ q: params.q, folder: params.folder, kind: params.kind, page: params.page })
      .filter(([, v]) => Boolean(v)) as [string, string][],
  ).toString();

  const tabHref = (k: "image" | "file") => {
    const q = new URLSearchParams();
    if (k === "file") q.set("kind", "file");
    const s = q.toString();
    return `/admin/media${s ? `?${s}` : ""}`;
  };

  const filtered = Boolean(params.q || params.folder);

  return (
    <>
      <h1 className="admin-title mb-1.5">Media</h1>
      <p className="mb-5 max-w-[70ch] text-[14px] text-muted">
        Everything uploaded through the CMS. Right-click a tile — or use its ⋯
        button — to copy its path, resize it, rename it or remove it. These
        files are public by design, which is the opposite of ticket
        attachments.
      </p>

      {params.deleted && (
        <Alert tone="ok" title="File deleted">
          Anything still pointing at it will now show a broken image.
        </Alert>
      )}
      {params.folder_deleted && (
        <Alert tone="ok" title="Folder deleted">
          Its files were not — they are in Unfiled.
        </Alert>
      )}

      {/* Files / Images. A tab rather than a filter control because they are
          two libraries in one table, and which one you are in should survive
          being read at a glance. */}
      <div role="tablist" aria-label="Library" className="mb-5 flex gap-0.5 border-b border-line">
        {(["image", "file"] as const).map((k) => {
          const selected = kind === k;
          return (
            <Link
              key={k}
              role="tab"
              aria-selected={selected}
              href={tabHref(k)}
              className={cn(
                "-mb-px rounded-t border-b-2 px-4 py-2 text-[13.5px]",
                selected
                  ? "border-brand-600 bg-brand-50 font-semibold text-brand-700"
                  : "border-transparent font-medium text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {k === "image" ? "Images" : "Files"}
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[196px_1fr] lg:gap-8">
        <FolderRail
          folders={folders}
          current={params.folder}
          kind={params.kind === "file" ? "file" : ""}
          total={result.meta.total}
        />

        <div className="min-w-0">
          <MediaUploader folderId={params.folder} />

          <FilterBar action="/admin/media">
            {/* The tab and folder have to ride along, or searching inside a
                folder silently drops you back to everything. */}
            {params.kind === "file" && <input type="hidden" name="kind" value="file" />}
            {params.folder && <input type="hidden" name="folder" value={params.folder} />}
            <div className="min-w-0">
              <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
              <Input id="q" name="q" defaultValue={params.q} placeholder="Filename…" className="min-w-[210px] py-1.5 text-[13px]" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm">Apply</Button>
              {filtered && <ButtonLink href={tabHref(kind)} variant="ghost" size="sm">Clear</ButtonLink>}
            </div>
          </FilterBar>

          {items.length === 0 ? (
            <EmptyState
              icon={<IconImage />}
              title={filtered ? "Nothing here matches" : kind === "file" ? "No documents yet" : "Nothing uploaded yet"}
            >
              {filtered
                ? "Try a different term, or clear the filters."
                : kind === "file"
                  ? "Upload a PDF or a datasheet above — documents live here, images on the other tab."
                  : "Upload an image above, or add one from any record's cover picker."}
            </EmptyState>
          ) : (
            <MediaGrid items={items} returnTo={returnTo} />
          )}

          <Pagination
            meta={result.meta}
            basePath="/admin/media"
            params={{ q: params.q, folder: params.folder, kind: params.kind }}
          />
        </div>
      </div>
    </>
  );
}
