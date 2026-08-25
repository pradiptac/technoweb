import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getForm } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { FormForm } from "../form-form";
import { deleteFormAction } from "../actions";
import type { SiteForm } from "@/types/api";

export const metadata = buildMetadata({ title: "Edit form", path: "/admin/forms", seo: noIndex });

export default async function EditFormPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  let form: SiteForm;
  try {
    form = await getForm(Number(id));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const count = form.submissions_count ?? 0;

  return (
    <>
      <PageHeader back={{ href: "/admin/forms", label: "All forms" }} title="Edit form">
        <Badge tone={form.status === "published" ? "resolved" : "progress"}>
          {form.fields?.length ?? 0} field{(form.fields?.length ?? 0) === 1 ? "" : "s"}
        </Badge>
        <Link href={`/admin/forms/${form.id}/submissions`} className="ml-auto py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
          {count} submission{count === 1 ? "" : "s"} →
        </Link>
      </PageHeader>

      <FormForm form={form} saved={Boolean(saved)} />

      {/* Outside the form: a nested form is invalid markup and browsers drop
          one of the two. */}
      <form action={deleteFormAction} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={form.id} />
        <input type="hidden" name="slug" value={form.slug} />
        <p className="mb-2 text-[13px] text-muted">
          Deleting this removes the form and its fields. Submissions already collected are
          kept — they are a record of something a person sent, not part of the form.
        </p>
        <Button type="submit" variant="ghost" size="sm" className="text-err">Delete form</Button>
      </form>
    </>
  );
}
