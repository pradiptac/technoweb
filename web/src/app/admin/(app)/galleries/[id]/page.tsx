import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getGallery, type GalleryTransitionOption } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { Button } from "@/components/ui/button";
import { GalleryForm } from "../gallery-form";
import { deleteGalleryAction } from "../actions";
import type { Gallery } from "@/types/api";

export const metadata = buildMetadata({ title: "Edit gallery", path: "/admin/galleries", seo: noIndex });

export default async function EditGalleryPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  let gallery: Gallery;
  let transitions: GalleryTransitionOption[] = [];
  try {
    const res = await getGallery(Number(id));
    gallery = res.data;
    transitions = res.meta.transitions ?? [];
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const count = gallery.items?.length ?? 0;

  return (
    <>
      <PageHeader back={{ href: "/admin/galleries", label: "All galleries" }} title="Edit gallery">
        <Badge tone={gallery.status === "published" ? "resolved" : "progress"}>
          {count} picture{count === 1 ? "" : "s"}
        </Badge>
      </PageHeader>
      <GalleryForm gallery={gallery} transitions={transitions} saved={Boolean(saved)} />

      {/* Outside the form: a delete button inside another form's markup is a
          nested form, which is invalid and which browsers resolve by dropping
          one of them. */}
      <form action={deleteGalleryAction} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={gallery.id} />
        <input type="hidden" name="slug" value={gallery.slug} />
        <p className="mb-2 text-[13px] text-muted">
          Deleting this removes its tabs and its list of pictures. The files
          themselves stay in the media library. Anything embedding{" "}
          <code className="font-mono text-[12.5px]">{`[gallery slug="${gallery.slug}"]`}</code>{" "}
          will render nothing in its place.
        </p>
        <Button type="submit" variant="ghost" size="sm" className="text-err">Delete gallery</Button>
      </form>
    </>
  );
}
