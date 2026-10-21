import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/empty";
import { RevisionPanel } from "@/components/admin/revision-panel";
import { RecordNotesPanel } from "@/components/admin/record-notes-panel";
import { PreviewLinkPanel } from "@/components/admin/preview-link-panel";
import { getTenderWithMeta } from "@/lib/admin";
import { ApiError } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { TenderForm } from "../tender-form";
import { DuplicateTender } from "../tender-row-actions";
import { stateTone } from "../tender-tones";

export const metadata = buildMetadata({ title: "Edit tender", path: "/admin/tenders", seo: noIndex });

export default async function EditTenderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen();
  const { id } = await params;

  if (!/^\d+$/.test(id)) notFound();

  let loaded;
  try {
    loaded = await getTenderWithMeta(Number(id));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();

    return (
      <ErrorState title="We could not load the tender">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const { tender, meta } = loaded;

  return (
    <>
      <PageHeader back={{ href: "/admin/tenders", label: "All tenders" }} title="Edit tender">
        <Badge tone={tender.status === "published" ? "resolved" : "progress"}>{tender.status_label}</Badge>
        <Badge tone={stateTone(tender.state)}>{tender.state_label}</Badge>

        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          <RecordNotesPanel type="tender" id={tender.id} />
          <RevisionPanel type="tender" id={tender.id} />
          <PreviewLinkPanel type="tender" id={tender.id} />
          <DuplicateTender id={tender.id} title={tender.title} back={`/admin/tenders/${tender.id}`} />
          {tender.status === "published" && (
            <Link href={tender.public_path} className="py-1 text-13-5 font-semibold text-brand-ink hover:underline">
              View on site ↗
            </Link>
          )}
        </div>
      </PageHeader>

      {/*
        Keyed on what was last stored, so a successful save mounts a fresh
        form on it — an uncontrolled select otherwise snaps back to its first
        option. A refused save changes nothing here, so the form stays
        mounted and `<Form>` puts back what was typed.
      */}
      <TenderForm key={tender.updated_at ?? String(tender.id)} tender={tender} meta={meta} />
    </>
  );
}
