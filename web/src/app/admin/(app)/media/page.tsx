import Link from "next/link";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconImage } from "@/components/icons";
import { getMediaFolders, getMediaList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";
import { Upload, UploadStatus } from "./media-uploader";
import { emptyTrashAction } from "./actions";
import { LibraryInfo } from "./library-info";
import { FolderRail } from "./folder-rail";
import { MediaGrid } from "./media-grid";
import { DropZone } from "./drop-zone";
import { UploadProvider } from "./upload-context";
import type { MediaFolder } from "@/types/api";
import type { MediaListResponse } from "@/lib/admin";

export const metadata = buildMetadata({ title: "Media", path: "/admin/media", seo: noIndex });

type SearchParams = {
  q?: string;
  page?: string;
  folder?: string;
  kind?: string;
  deleted?: string;
  folder_deleted?: string;
  per_page?: string;
  sort?: string;
  direction?: string;
  trashed?: string;
  size?: string;
  restored?: string;
  purged?: string;
  trash_emptied?: string;
};

/**
 * The orderings offered, and the labels that go with them.
 *
 * The same four keys the API accepts. It falls back rather than returning 422
 * on an unknown one, so this list is the menu rather than the validation — but
 * the two have to say the same thing, or an option here silently does nothing.
 */
/**
 * Thumbnail sizes, as tile widths rather than a pixel slider.
 *
 * The design shows a continuous slider; this is three steps, because the grid
 * is a responsive column count and a continuous width would fight it — every
 * intermediate value produces a ragged last row at some viewport. Three named
 * densities give the same control with none of that, and the choice rides in
 * the URL so it survives a reload and can be linked.
 */
const TILE_SIZES = {
  small: "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10",
  medium: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
  large: "sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3",
} as const;

type TileSize = keyof typeof TILE_SIZES;

const SORTS = [
  { value: "created_at", label: "Upload date" },
  { value: "updated_at", label: "Last modified" },
  { value: "filename", label: "File name" },
  { value: "size", label: "File size" },
] as const;

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const kind = params.kind === "file" ? "file" : "image";
  const trashed = params.trashed === "1";
  const size: TileSize = params.size === "small" || params.size === "large" ? params.size : "medium";

  /*
    Resolved here rather than left to the API, because the toolbar has to
    render the *current* ordering as its selected option — and "whatever the
    server decided" is not something a <select> can show. The fallbacks are the
    same ones `applySort` uses, so the control and the query always agree.

    A-Z for a name and newest-first for everything else: the sensible direction
    is a property of the column rather than a constant.
  */
  const sort = SORTS.some((o) => o.value === params.sort) ? params.sort! : "created_at";
  const direction = params.direction === "asc" || params.direction === "desc"
    ? params.direction
    : sort === "filename" ? "asc" : "desc";

  let result: MediaListResponse;
  let folders: MediaFolder[];
  try {
    [result, folders] = await Promise.all([
      getMediaList({
        q: params.q,
        page: Number(params.page) || 1,
        per_page: Number(params.per_page) || undefined,
        folder: params.folder,
        kind,
        sort,
        direction,
        trashed,
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
    Object.entries({
      q: params.q, folder: params.folder, kind: params.kind, page: params.page,
      sort: params.sort, direction: params.direction, trashed: params.trashed,
      size: params.size,
    })
      .filter(([, v]) => Boolean(v)) as [string, string][],
  ).toString();

  const tabHref = (k: "image" | "file") => {
    const q = new URLSearchParams();
    if (k === "file") q.set("kind", "file");
    const s = q.toString();
    return `/admin/media${s ? `?${s}` : ""}`;
  };

  // Ordering deliberately does not count as a filter: Clear removes what is
  // hiding files, and resetting a sort somebody chose is not that.
  const filtered = Boolean(params.q || params.folder);

  return (
    <>
      {/*
        The three-line intro is one line now. It explained the menu, which the
        ⋯ button already announces, and it cost 63px of a 471px run-up before
        the first thumbnail on a screen whose whole job is showing thumbnails.
      */}
      <PageHeader
        className="mb-3"
        title="Media"
        lede={<>
          Public by design — the opposite of ticket attachments. Right-click a
          tile, or use its ⋯ button.
        </>}
      />

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
      {params.restored && (
        <Alert tone="ok" title="File restored">
          It is back at the same address, so anything that pointed at it works again.
        </Alert>
      )}
      {params.purged && (
        <Alert tone="ok" title="File deleted permanently">
          The file and every archived version of it are gone.
        </Alert>
      )}
      {params.trash_emptied && (
        <Alert tone="ok" title="Bin emptied">
          Every file in it, and its history, has been deleted permanently.
        </Alert>
      )}

      <div role="tablist" aria-label="Library" className="mb-4 flex gap-0.5 border-b border-line">
        {(["image", "file"] as const).map((k) => {
          const selected = kind === k && !trashed && sort !== "updated_at";
          return (
            <Link
              key={k}
              role="tab"
              aria-selected={selected}
              href={tabHref(k)}
              className={cn(
                "-mb-px rounded-t border-b-2 px-3.5 py-1.5 text-[13px]",
                selected
                  ? "border-brand-600 bg-brand-50 font-semibold text-brand-ink"
                  : "border-transparent font-medium text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {k === "image" ? "Images" : "Files"}
            </Link>
          );
        })}

        {/*
          The bin is a third tab rather than a separate screen, because it is
          the same table filtered — and because putting it where the library
          already is means somebody who has just deleted the wrong thing finds
          it without being told where to look.
        */}
        {/*
          Recent is an *ordering*, not a filter — it is `?sort=updated_at`
          wearing a tab, because "what was I just working on" is the commonest
          way back into a library and two dropdown changes is a poor way to ask
          it. Nothing is hidden, so it needs no endpoint of its own.
        */}
        <Link
          role="tab"
          aria-selected={sort === "updated_at" && !trashed}
          href="/admin/media?sort=updated_at&direction=desc"
          className={cn(
            "-mb-px rounded-t border-b-2 px-3.5 py-1.5 text-[13px]",
            sort === "updated_at" && !trashed
              ? "border-brand-600 bg-brand-50 font-semibold text-brand-ink"
              : "border-transparent font-medium text-muted hover:bg-surface-2 hover:text-ink",
          )}
        >
          Recent
        </Link>

        <Link
          role="tab"
          aria-selected={trashed}
          href="/admin/media?trashed=1"
          className={cn(
            "-mb-px ml-auto rounded-t border-b-2 px-3.5 py-1.5 text-[13px]",
            trashed
              ? "border-brand-600 bg-brand-50 font-semibold text-brand-ink"
              : "border-transparent font-medium text-muted hover:bg-surface-2 hover:text-ink",
          )}
        >
          Bin
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[172px_1fr] lg:gap-6">
        <FolderRail
          folders={folders}
          current={params.folder}
          kind={params.kind === "file" ? "file" : ""}
          total={result.meta.total}
        />

        {/* The provider spans the toolbar *and* the grid, so choosing files
            and dropping them report into the same status line. */}
        <UploadProvider folderId={params.folder}>
        <DropZone>
          {/* Nothing is uploaded *into* the bin, and filtering it by folder
              is meaningless — a binned file's folder is where it will return
              to, not where it is. */}
          {!trashed && result.meta.library && <LibraryInfo meta={result.meta.library} />}

          {trashed && items.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-surface px-3.5 py-2.5">
              <p className="text-[12.5px] text-muted">
                Deleted files keep their address, so restoring one repairs
                anything that still points at it. Nothing here is removed
                automatically.
              </p>
              <form action={emptyTrashAction} className="ml-auto">
                <input type="hidden" name="return_to" value={returnTo} />
                <Button type="submit" variant="destructive" size="sm">Empty the bin</Button>
              </form>
            </div>
          )}

          {!trashed && <FilterBar action="/admin/media">
            {/* The tab and folder have to ride along, or searching inside a
                folder silently drops you back to everything. */}
            {params.kind === "file" && <input type="hidden" name="kind" value="file" />}
            {params.folder && <input type="hidden" name="folder" value={params.folder} />}

            {/*
              Upload leads the row, ahead of the query controls.

              It is an action among filters, which is a toolbar rather than a
              form — and it is the reason people open this screen with intent.
              Putting it here is what removed a whole band of chrome: the
              buttons cost the row nothing, because the row already exists and
              is already the tallest thing above the grid.
            */}
            <Upload folderId={params.folder} />

            <div className="min-w-0">
              <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
              <Input id="q" name="q" defaultValue={params.q} placeholder="Filename or description…" className="min-w-[210px] py-1.5 text-[13px]" />
            </div>
            {/*
              Ordering, as two controls rather than eight combined options.

              "Name Z-A" and "Newest first" in one list is the column and the
              direction multiplied together, which reads fine at four entries
              and not at eight. Split, each control says one thing — and the
              direction keeps its meaning when the column changes.
            */}
            <div className="min-w-0">
              <label htmlFor="sort" className="mb-0.5 block text-[11px] font-semibold text-faint">Sort by</label>
              <Select id="sort" name="sort" defaultValue={sort} className="py-1.5 text-[13px]">
                {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
            <div className="min-w-0">
              <label htmlFor="direction" className="mb-0.5 block text-[11px] font-semibold text-faint">Order</label>
              {/* Worded for the column rather than "asc"/"desc", which are the
                  database's words and mean nothing over a grid of photographs. */}
              <Select id="direction" name="direction" defaultValue={direction} className="py-1.5 text-[13px]">
                <option value="desc">
                  {sort === "filename" ? "Z to A" : sort === "size" ? "Largest first" : "Newest first"}
                </option>
                <option value="asc">
                  {sort === "filename" ? "A to Z" : sort === "size" ? "Smallest first" : "Oldest first"}
                </option>
              </Select>
            </div>

            {/* A view preference, so it posts with the filters and is
                remembered by the URL like everything else here. */}
            <div className="min-w-0">
              <label htmlFor="size" className="mb-0.5 block text-[11px] font-semibold text-faint">Tiles</label>
              <Select id="size" name="size" defaultValue={size} className="py-1.5 text-[13px]">
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button type="submit" size="sm">Apply</Button>
              {filtered && <ButtonLink href={tabHref(kind)} variant="ghost" size="sm">Clear</ButtonLink>}
            </div>
          </FilterBar>}

          {/* Nothing while idle — see its docblock. */}
          {!trashed && <UploadStatus />}

          {items.length === 0 ? (
            <EmptyState
              icon={<IconImage />}
              title={
                trashed ? "The bin is empty"
                  : filtered ? "Nothing here matches"
                    : kind === "file" ? "No documents yet" : "Nothing uploaded yet"
              }
            >
              {trashed
                ? "Deleted files wait here until you remove them for good."
                : filtered
                  ? "Try a different term, or clear the filters."
                  : kind === "file"
                    ? "Use Upload above, or drop a PDF anywhere on this page — documents live here, images on the other tab."
                    /*
                      The empty state is where dropping is now advertised.

                      The dashed panel used to say "or drag them here" and
                      charged 300px above every full library for the privilege.
                      A page with nothing on it has the room, and it is exactly
                      the moment somebody needs telling — after that, the drop
                      overlay teaches it the first time anything is dragged.
                    */
                    : "Use Upload above, or drop images anywhere on this page. You can also add one from any record's cover picker."}
            </EmptyState>
          ) : (
            <MediaGrid items={items} returnTo={returnTo} folders={folders} trashed={trashed}
              columns={TILE_SIZES[size]} />
          )}

          <Pagination
            meta={result.meta}
            basePath="/admin/media"
            params={{
              q: params.q, folder: params.folder, kind: params.kind,
              per_page: params.per_page, sort: params.sort, direction: params.direction,
              trashed: params.trashed, size: params.size,
            }}
          />
        </DropZone>
        </UploadProvider>
      </div>
    </>
  );
}
