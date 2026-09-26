import { notFound } from "next/navigation";
import { PageSections } from "@/components/page-sections/page-sections";
import { SectionsFrame } from "@/components/page-sections/sections-frame";
import { getToken } from "@/lib/admin-auth";
import { readPreviewDraft } from "@/lib/admin/preview-drafts";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";

export const metadata = buildMetadata({ title: "Unsaved preview", path: "/admin/draft-preview", seo: noIndex });

/**
 * The page builder's unsaved preview, framed by the form's Preview dialog
 * (`lib/admin/preview-drafts.ts` says why it is a page and not JSX from a
 * Server Action). Outside `admin/(app)` on purpose: it is drawn inside an
 * iframe, where the console's sidebar and header would be chrome around the
 * page rather than a preview of it. Only the staff session that made the
 * draft can read it.
 */
export default async function DraftPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const token = await getToken();
  if (!token) notFound();

  const { id } = await params;
  const sections = readPreviewDraft(id, token);

  return (
    <main id="main">
      {sections ? (
        <SectionsFrame>
          <PageSections sections={sections} crumbs={[]} ownsH1={false} />
        </SectionsFrame>
      ) : (
        <p className="p-8 text-center text-13-5 text-muted">
          This preview has expired. Close it and press Preview again.
        </p>
      )}
    </main>
  );
}
