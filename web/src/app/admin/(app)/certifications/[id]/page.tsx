import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getCertification } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { CertificationForm } from "../certification-form";
import { deleteCertificationAction } from "../actions";
import type { AdminCertification } from "@/types/api";

export const metadata = buildMetadata({ title: "Edit certification", path: "/admin/certifications", seo: noIndex });

export default async function EditCertificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  let certification: AdminCertification;
  try {
    certification = await getCertification(numericId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/certifications", label: "All certifications" }} title="Edit certification">
        <Badge tone={certification.status === "published" ? "resolved" : "progress"}>{certification.status}</Badge>
        {certification.is_expired && <Badge tone="urgent">Expired</Badge>}
      </PageHeader>

      {/* `?done=saved` is announced by the layout's toast; no inline alert. */}
      <CertificationForm certification={certification} />

      {/* Outside the form: a form inside a form is invalid markup. */}
      <form action={deleteCertificationAction} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={certification.id} />
        <p className="mb-2 text-13 text-muted">
          Deleting this takes it off the site. The badge and the PDF stay in the media library.
        </p>
        <Button type="submit" variant="ghost" size="sm" className="text-err">Delete certification</Button>
      </form>
    </>
  );
}
