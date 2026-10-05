import { notFound } from "next/navigation";
import { BuilderPreviewBridge } from "@/components/page-sections/builder-preview-bridge";
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
 *
 * It is also the builder's **live preview** (0.112.0): the sections are
 * marked with their ids and `BuilderPreviewBridge` talks to the builder
 * framing it — a press on a section opens that section's card, and opening a
 * card scrolls the preview to it.
 */
export default async function DraftPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const token = await getToken();
  if (!token) notFound();

  const { id } = await params;
  const sections = readPreviewDraft(id, token);

  return (
    <main id="main">
      {/* The frame is a document of its own; its sections draw an opening hero as an h2. */}
      <h1 className="sr-only">Unsaved preview</h1>
      {sections ? (
        <SectionsFrame>
          <PageSections sections={sections} crumbs={[]} ownsH1={false} marked />
          <BuilderPreviewBridge />
        </SectionsFrame>
      ) : (
        <p className="p-8 text-center text-13-5 text-muted">
          This preview has expired. Press Preview again, or change a section to redraw it.
        </p>
      )}
    </main>
  );
}
