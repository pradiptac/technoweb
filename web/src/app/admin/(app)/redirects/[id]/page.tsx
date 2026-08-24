import { PageHeader } from "@/components/admin/page-header";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getRedirect } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { RedirectForm } from "../redirect-form";
import type { AdminRedirect } from "@/types/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit redirect", path: `/admin/redirects/${id}`, seo: noIndex });
}

export default async function EditRedirectPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let record: AdminRedirect;
  try {
    record = await getRedirect(numericId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/redirects", label: "All redirects" }}
        title="Edit redirect"
      />

      <RedirectForm record={record} saved={Boolean(saved)} />
    </>
  );
}
