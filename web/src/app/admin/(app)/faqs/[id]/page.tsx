import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getFaq, getFaqOwners } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { FaqForm } from "../faq-form";
import type { AdminFaq, FaqOwnerGroup } from "@/types/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit FAQ", path: `/admin/faqs/${id}`, seo: noIndex });
}

export default async function EditFaqPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let faq: AdminFaq;
  let owners: FaqOwnerGroup[] = [];
  try {
    [faq, owners] = await Promise.all([getFaq(numericId), getFaqOwners()]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <Link href="/admin/faqs" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All FAQs
      </Link>
      <h1 className="admin-title mt-4 mb-6">Edit FAQ</h1>

      <FaqForm faq={faq} owners={owners} saved={Boolean(saved)} />
    </>
  );
}
