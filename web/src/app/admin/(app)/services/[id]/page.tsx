import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getService } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ServiceForm } from "../service-form";
import type { AdminService } from "@/types/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit service", path: `/admin/services/${id}`, seo: noIndex });
}

const statusTone = { published: "resolved", draft: "progress", archived: "closed" } as const;

export default async function EditServicePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let service: AdminService;
  try {
    service = await getService(numericId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <Link href="/admin/services" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All services
      </Link>

      <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="admin-title">Edit service</h1>
        <Badge tone={statusTone[service.status]}>{service.status_label}</Badge>
        {service.status === "published" && (
          <Link href={`/services/${service.slug}`} className="ml-auto py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
            View on site ↗
          </Link>
        )}
      </div>

      <ServiceForm service={service} saved={Boolean(saved)} />
    </>
  );
}
