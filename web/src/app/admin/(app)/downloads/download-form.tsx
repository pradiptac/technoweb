"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { DocumentField } from "@/components/admin/document-field";
import { FormActions } from "@/components/admin/form-actions";
import { RelationPicker } from "@/components/admin/relation-picker";
import { useUploadForm } from "@/lib/hooks/use-upload-form";
import { formatBytes } from "@/lib/format-bytes";
import { cn } from "@/lib/utils";
import type { AdminDownload, AdminDownloadOptions } from "@/types/downloads";
import {
  createDownloadAction, downloadUploadedAction, updateDownloadAction, type DownloadState,
} from "./actions";

const initial: DownloadState = {};

/*
 * Three panels, and the order here is the order of the three children of
 * `<Tabs>` below, which reads them by position. `file` owns `status` too:
 * "add the file before publishing" is a refusal about the file, raised on
 * the status, and it has to open the panel that fixes it.
 */
const GROUPS: TabGroup[] = [
  { id: "details", label: "Details", fields: ["title", "summary", "download_category_id", "version", "released_on", "sort_order"] },
  { id: "file", label: "File", fields: ["source", "file_path", "file", "access", "status"] },
  { id: "products", label: "Products", fields: ["product_ids", "store_product_ids"] },
];

/**
 * One download (docs/downloads.md).
 *
 * The form posts through its Server Action until it carries a file to
 * upload; then `useUploadForm` sends the multipart body itself to a route
 * handler, so a firmware image going up shows a real percentage. The API
 * takes the same fields either way — on POST with `_method=PATCH` for an
 * edit, since PHP reads a multipart body on POST only.
 */
export function DownloadForm({ download, options }: { download?: AdminDownload; options: AdminDownloadOptions }) {
  const router = useRouter();
  const editing = Boolean(download);
  const action = download ? updateDownloadAction.bind(null, download.id) : createDownloadAction;

  const [source, setSource] = useState<string>(download?.source ?? "library");
  const [access, setAccess] = useState<string>(download?.access ?? "public");

  const { state, formAction, pending, progress, onSubmitCapture } = useUploadForm<DownloadState>({
    action,
    initial,
    url: download ? `/api/admin/downloads/${download.id}` : "/api/admin/downloads",
    prepare: useCallback((data: FormData) => {
      // Laravel reads a list from `name[]`, and a multipart form cannot say
      // "an empty list" — `relations_sent` says it for both pickers.
      for (const key of ["product_ids", "store_product_ids"]) {
        const values = data.getAll(key);
        data.delete(key);
        values.forEach((v) => data.append(`${key}[]`, v));
      }
      data.delete("store_products_sent");
      data.set("relations_sent", "1");
      if (String(data.get("sort_order") ?? "").trim() === "") data.set("sort_order", "0");
      if (editing) data.set("_method", "PATCH");
    }, [editing]),
    loginPath: "/admin/login",
    onSuccess: useCallback((body: unknown) => {
      const id = (body as { data?: { id?: number } } | null)?.data?.id;
      if (!id) return { error: "The file went up, but the answer could not be read. Reload the page to check." } as DownloadState;

      // The upload was the browser's own request to a route handler, which
      // cannot purge the site's caches; this action does, then the screen moves on.
      void downloadUploadedAction(id).finally(() => {
        router.push(`/admin/downloads/${id}?done=${editing ? "download-saved" : "download-created"}`);
        router.refresh();
      });
    }, [editing, router]),
  });

  const err = (field: string) => state.fieldErrors?.[field]?.[0];
  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  const maxMb = Math.floor(options.max_upload_kb / 1024);
  const limit = maxMb >= 1024 ? `${(maxMb / 1024).toFixed(1).replace(/\.0$/, "")} GB` : `${maxMb} MB`;
  const current = download?.source === "upload" ? download.file : null;
  const shopPicker = options.store_products.length > 0 || (download?.store_product_ids?.length ?? 0) > 0;

  const choose = (value: string) => {
    setSource(value);
    // A library file has a public address, so it cannot be customers-only.
    if (value === "library") setAccess("public");
  };

  return (
    <Form action={formAction} state={state} onSubmitCapture={onSubmitCapture}>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      {download?.file_missing && (
        <Alert tone="warn" title="This download's file is missing" dismissible={false}>
          {download.source === "library"
            ? "The file it pointed at is no longer in the media library, so the download is hidden from the site. Choose another file on the File tab."
            : "The uploaded file is no longer on the server, so the download is hidden from the site. Upload it again on the File tab."}
        </Alert>
      )}

      {/* Three children, one per entry in GROUPS and in that order. */}
      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        {/* ---------------------------------------------------------- Details */}
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Title" htmlFor="title" error={err("title")} hint="What the file is — “CBS350 datasheet”, “Aruba 6100 firmware”.">
              <Input id="title" name="title" defaultValue={download?.title} required maxLength={160} aria-invalid={Boolean(err("title"))} />
            </Field>

            <Field label="Summary" htmlFor="summary" error={err("summary")} hint="A sentence under the title: what it covers, or what changed. Plain text.">
              <Textarea id="summary" name="summary" rows={3} defaultValue={download?.summary ?? ""} maxLength={500} />
            </Field>

            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Version" htmlFor="version" error={err("version")} hint="Optional — “2.4.1”, “Rev. C”.">
                <Input id="version" name="version" defaultValue={download?.version ?? ""} maxLength={40} />
              </Field>
              <Field label="Released on" htmlFor="released_on" variant="float-static" error={err("released_on")} hint="Optional. Newer files are listed first within a category.">
                <Input id="released_on" name="released_on" type="date" defaultValue={download?.released_on ?? ""} />
              </Field>
            </div>
          </div>

          <aside className="min-w-0">
            <Field
              label="Category"
              htmlFor="download_category_id"
              variant="float-static"
              error={err("download_category_id")}
              hint={options.categories.length === 0 ? "There are no categories yet — add one under Categories." : "The shelf it is listed under."}
            >
              <Select id="download_category_id" name="download_category_id" defaultValue={download?.download_category_id ?? ""}>
                <option value="">No category</option>
                {options.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.is_active ? "" : " (switched off)"}</option>
                ))}
              </Select>
            </Field>

            <Field label="Order" htmlFor="sort_order" error={err("sort_order")} hint="Lower numbers first, within its category.">
              <Input id="sort_order" name="sort_order" type="number" min={0} max={65535} defaultValue={download?.sort_order ?? 0} />
            </Field>

            {download && (
              <p className="text-13 text-muted">
                Downloaded <strong className="font-semibold text-ink">{download.download_count.toLocaleString("en-IN")}</strong> time{download.download_count === 1 ? "" : "s"}.
              </p>
            )}
          </aside>
        </div>

        {/* ------------------------------------------------------------- File */}
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <fieldset className="mb-[18px]">
              <legend className="mb-2 text-13-5 font-semibold">Where the file is kept</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {options.sources.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors duration-(--duration-base)",
                      source === option.value ? "border-brand-ink bg-surface-2" : "border-line-strong bg-card hover:border-brand-ink",
                    )}
                  >
                    <input
                      type="radio" name="source" value={option.value} className="mt-1"
                      checked={source === option.value} onChange={() => choose(option.value)}
                    />
                    <span className="min-w-0">
                      <span className="block text-14 font-semibold text-ink">{option.label}</span>
                      {option.blurb && <span className="mt-0.5 block text-12-5 leading-[1.5] text-muted">{option.blurb}</span>}
                    </span>
                  </label>
                ))}
              </div>
              {err("source") && <p className="mt-1 text-12 text-err">{err("source")}</p>}
            </fieldset>

            {/* Both stay mounted and one is hidden: a control that leaves the
                form takes its value out of the submission with it. */}
            <div hidden={source !== "library"}>
              <DocumentField
                name="file_path"
                label="File from the media library"
                hint="A PDF, a document or an archive. Upload it in the dialog if it is not there yet."
                defaultPath={download?.source === "library" ? download.file_path : null}
                defaultName={download?.source === "library" ? download.file?.name ?? null : null}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                error={err("file_path")}
              />
            </div>

            <div hidden={source !== "upload"}>
              {current && (
                <p className="mb-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-13">
                  <span className="min-w-0 truncate font-semibold text-ink">{current.name}</span>
                  <span className="text-muted">{formatBytes(current.size)}</span>
                  {/* A plain link: a `next/link` to a route handler is prefetched. */}
                  <a href={`/api/admin/downloads/${download!.id}/file`} className="ml-auto font-semibold text-brand-ink underline">
                    Download it
                  </a>
                </p>
              )}
              <Field
                label={current ? "Replace the file" : "The file"}
                htmlFor="file"
                variant="above"
                error={err("file")}
                hint={`Up to ${limit}. Kept off the public disk and handed out by the site. ${current ? "Uploading another replaces the one above." : ""}`}
              >
                <FileDrop id="file" name="file" label="Select the file…" progress={progress} />
              </Field>
            </div>
          </div>

          <aside className="min-w-0">
            <Field
              label="Who may download it"
              htmlFor="access"
              variant="float-static"
              error={err("access")}
              hint={source === "library"
                ? "A library file has a public address. To limit a file to customers, choose “Uploaded here”."
                : "A customers-only file is still listed for everybody, with a lock; downloading it needs a portal sign-in."}
            >
              <Select id="access" name="access" value={access} onChange={(e) => setAccess(e.target.value)}>
                {options.accesses.map((option) => (
                  <option key={option.value} value={option.value} disabled={option.value === "customers" && source === "library"}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Status"
              htmlFor="status"
              variant="float-static"
              error={err("status")}
              hint="A download is published only once it has a file."
            >
              <Select id="status" name="status" defaultValue={download?.status ?? "draft"}>
                {options.statuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </Field>
          </aside>
        </div>

        {/* --------------------------------------------------------- Products */}
        <div className="grid gap-x-8 lg:grid-cols-2">
          <RelationPicker
            name="product_ids"
            label="Catalogue products"
            hint="The file is listed under Downloads on each of these product pages."
            options={options.products}
            defaultValue={download?.product_ids ?? []}
            error={err("product_ids")}
          />
          {shopPicker ? (
            <div>
              {/* Says "the shop list was on the form", so an empty selection clears it. */}
              <input type="hidden" name="store_products_sent" value="1" />
              <RelationPicker
                name="store_product_ids"
                label="Shop products"
                hint="And on each of these pages of the shop."
                options={options.store_products}
                defaultValue={download?.store_product_ids ?? []}
                error={err("store_product_ids")}
              />
            </div>
          ) : (
            <p className="text-13 text-muted">The shop has no products yet, so there is nothing there to attach this to.</p>
          )}
        </div>
      </Tabs>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? (progress ? "Uploading…" : "Saving…") : download ? "Save download" : "Create download"}
        </Button>
      </FormActions>
    </Form>
  );
}
