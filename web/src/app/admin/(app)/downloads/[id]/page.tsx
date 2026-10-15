import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getDownload, getDownloadOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import type { AdminDownload } from "@/types/downloads";
import { DownloadForm } from "../download-form";
import { deleteDownloadAction } from "../actions";

export const metadata = buildMetadata({ title: "Edit download", path: "/admin/downloads", seo: noIndex });

export default async function EditDownloadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen();
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  let download: AdminDownload;
  try {
    download = await getDownload(numericId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const options = await getDownloadOptions();

  return (
    <>
      <PageHeader back={{ href: "/admin/downloads", label: "All downloads" }} title={download.title}>
        <Badge tone={download.status === "published" ? "resolved" : "progress"}>{download.status}</Badge>
        {download.access === "customers" && <Badge tone="progress">Customers only</Badge>}
        {!download.has_file && <Badge tone="urgent">{download.file_missing ? "File missing" : "No file yet"}</Badge>}
      </PageHeader>

      {/*
        Keyed on the last save: after an upload the screen stays on this
        address, and a remount is what empties the file box and re-reads the
        saved values. `?done=` is announced by the layout's toast.
      */}
      <DownloadForm key={download.updated_at ?? "new"} download={download} options={options} />

      {/* Outside the form: a form inside a form is invalid markup. */}
      <form action={deleteDownloadAction} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={download.id} />
        <p className="mb-2 text-13 text-muted">
          Deleting this takes it off the site and off every product page.{" "}
          {download.source === "upload"
            ? "Its uploaded file is deleted with it."
            : "Its file stays in the media library."}
        </p>
        <Button type="submit" variant="ghost" size="sm" className="py-1 text-err">Delete download</Button>
      </form>
    </>
  );
}
