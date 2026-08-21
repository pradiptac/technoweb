import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getIndustries, getProducts, getSolution } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { SolutionForm } from "../solution-form";
import type { AdminIndustry, AdminProduct, AdminSolution } from "@/types/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit solution", path: `/admin/solutions/${id}`, seo: noIndex });
}

const statusTone = { published: "resolved", draft: "progress", archived: "closed" } as const;

export default async function EditSolutionPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let solution: AdminSolution;
  let products: AdminProduct[] = [];
  let industries: AdminIndustry[] = [];
  try {
    [solution, products, industries] = await Promise.all([
      getSolution(numericId), getProducts(), getIndustries(),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <Link href="/admin/solutions" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All solutions
      </Link>

      <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
        <h2 className="display-3">Edit solution</h2>
        <Badge tone={statusTone[solution.status]}>{solution.status_label}</Badge>
        {solution.status === "published" && (
          <Link
            href={`/solutions/${solution.slug}`}
            className="ml-auto py-1 text-[13.5px] font-semibold text-brand-600 hover:underline"
          >
            View on site ↗
          </Link>
        )}
      </div>

      <SolutionForm solution={solution} products={products} industries={industries} saved={Boolean(saved)} />
    </>
  );
}
