import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getCaseStudy, getIndustries } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { CaseStudyForm } from "../case-study-form";
import type { AdminCaseStudy, AdminIndustry } from "@/types/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit case study", path: `/admin/case-studies/${id}`, seo: noIndex });
}

const statusTone = { published: "resolved", draft: "progress", archived: "closed" } as const;

export default async function EditCaseStudyPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let study: AdminCaseStudy;
  let industries: AdminIndustry[] = [];
  try {
    [study, industries] = await Promise.all([getCaseStudy(numericId), getIndustries()]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/case-studies", label: "All case studies" }}
        title="Edit case study"
      >
        <Badge tone={statusTone[study.status]}>{study.status_label}</Badge>
        {study.status === "published" && (
          <Link
            href={`/case-studies/${study.slug}`}
            className="ml-auto py-1 text-[13.5px] font-semibold text-brand-600 hover:underline"
          >
            View on site ↗
          </Link>
        )}
      </PageHeader>

      <CaseStudyForm study={study} industries={industries} saved={Boolean(saved)} />
    </>
  );
}
