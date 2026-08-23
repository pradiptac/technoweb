import Image from "next/image";
import { FilterBar } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconImage } from "@/components/icons";
import { getMediaList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { MediaUploader } from "./media-uploader";
import { deleteMediaAction } from "./actions";
import type { MediaItem, Paginated } from "@/types/api";

export const metadata = buildMetadata({ title: "Media", path: "/admin/media", seo: noIndex });

/** Bytes to something a person reads. */
function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type SearchParams = { q?: string; page?: string; deleted?: string };

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: Paginated<MediaItem>;
  try {
    result = await getMediaList({ q: params.q, page: Number(params.page) || 1 });
  } catch {
    return (
      <ErrorState title="We could not load the media library">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const items = result.data;

  return (
    <>
      <h1 className="admin-title mb-1.5">Media</h1>
      <p className="mb-6 max-w-[70ch] text-[14px] text-muted">
        Every image uploaded through the CMS. Cover images, logos and social
        previews all land here — copy a path to reuse one somewhere else. These
        files are public by design, which is the opposite of ticket attachments.
      </p>

      {params.deleted && (
        <Alert tone="ok" title="File deleted">
          Anything still pointing at it will now show a broken image.
        </Alert>
      )}

      <MediaUploader />

      <FilterBar action="/admin/media">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Filename…" className="min-w-[210px] py-1.5 text-[13px]" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {params.q && <ButtonLink href="/admin/media" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {items.length === 0 ? (
        <EmptyState icon={<IconImage />} title={params.q ? "No files match that search" : "Nothing uploaded yet"}>
          {params.q
            ? "Try a different term, or clear the search."
            : "Upload an image above, or add one from any record's cover picker."}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((m) => (
            <li key={m.id} className="overflow-hidden rounded-lg border border-line-strong bg-white">
              <span className="grid h-40 place-items-center overflow-hidden border-b border-line bg-surface">
                <Image
                  src={m.url} alt={m.alt_text ?? ""} width={m.width ?? 320} height={m.height ?? 160}
                  className="max-h-40 w-auto object-contain" unoptimized
                />
              </span>
              <div className="p-3.5">
                <p className="truncate text-[13.5px] font-medium">{m.filename}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {size(m.size)}
                  {m.width && m.height ? ` · ${m.width}×${m.height}` : ""}
                </p>
                {/* The storable path, not the URL — this is what a record's
                    image field holds, and select-all makes it copyable. */}
                <p className="mt-2 truncate rounded bg-surface px-2 py-1.5 font-mono text-[11.5px] text-muted select-all">
                  {m.path}
                </p>
                <form action={deleteMediaAction} className="mt-3">
                  <input type="hidden" name="id" value={m.id} />
                  <Button type="submit" variant="ghost" size="sm">Delete</Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination meta={result.meta} basePath="/admin/media" params={{ q: params.q }} />
    </>
  );
}
