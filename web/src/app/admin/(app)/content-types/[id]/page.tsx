import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getContentType } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { TypeForm } from "../type-form";

export const metadata = buildMetadata({ title: "Edit content type", path: "/admin/content-types", seo: noIndex });

export default async function EditContentTypePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let res: Awaited<ReturnType<typeof getContentType>>;
  try {
    res = await getContentType(numericId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const type = res.data;

  return (
    <>
      <PageHeader back={{ href: "/admin/content-types", label: "All content types" }} title={`Edit ${type.plural}`}>
        <Badge tone={type.is_active ? "resolved" : "closed"}>{type.is_active ? "On" : "Off"}</Badge>
        {type.is_active && type.archive_enabled && (
          <Link href={type.path} className="ml-auto py-1 text-13-5 font-semibold text-brand-ink hover:underline">
            View on site ↗
          </Link>
        )}
      </PageHeader>

      <TypeForm type={type} meta={res.meta} saved={Boolean(saved)} />
    </>
  );
}
