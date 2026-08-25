import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getIndustry, getSolutionOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { IndustryForm } from "../industry-form";
import type { AdminIndustry } from "@/types/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit industry", path: `/admin/industries/${id}`, seo: noIndex });
}

export default async function EditIndustryPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let industry: AdminIndustry;
  let solutions: { id: number; name: string }[] = [];
  try {
    [industry, solutions] = await Promise.all([getIndustry(numericId), getSolutionOptions()]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/industries", label: "All industries" }}
        title="Edit industry"
      >
        {/* No status badge — industries have no draft state. */}
        <Link href={`/industries/${industry.slug}`} className="ml-auto py-1 text-[13.5px] font-semibold text-brand-ink hover:underline">
          View on site ↗
        </Link>
      </PageHeader>

      <IndustryForm industry={industry} solutions={solutions} saved={Boolean(saved)} />
    </>
  );
}
