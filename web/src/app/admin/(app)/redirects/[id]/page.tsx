import Link from "next/link";
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
      <Link href="/admin/redirects" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All redirects
      </Link>
      <h2 className="display-3 mt-4 mb-6">Edit redirect</h2>

      <RedirectForm record={record} saved={Boolean(saved)} />
    </>
  );
}
