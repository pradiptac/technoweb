import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getBrand } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { BrandForm } from "../brand-form";
import type { AdminBrand } from "@/types/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit brand", path: `/admin/brands/${id}`, seo: noIndex });
}

export default async function EditBrandPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let brand: AdminBrand;
  try {
    brand = await getBrand(numericId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/brands", label: "All brands" }}
        title="Edit brand"
      >
        <Link href={`/products?brand=${brand.slug}`} className="ml-auto py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
          View products ↗
        </Link>
      </PageHeader>

      <BrandForm brand={brand} saved={Boolean(saved)} />
    </>
  );
}
