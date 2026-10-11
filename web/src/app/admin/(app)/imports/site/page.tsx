import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getNewsletterQueue, getSiteImports } from "@/lib/admin";
import { requireScreen } from "@/lib/admin-screen";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { QueueHealth, SiteImportIndex } from "@/types/api";
import { SiteImportWizard } from "./site-wizard";

export const metadata = buildMetadata({ title: "Import a website", path: "/admin/imports/site", seo: noIndex });

export default async function SiteImportPage() {
  await requireScreen();
  let index: SiteImportIndex;
  let queue: QueueHealth | null;

  try {
    [index, queue] = await Promise.all([getSiteImports(), getNewsletterQueue().catch(() => null)]);
  } catch {
    return <ErrorState title="We could not load this screen">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader
        title="Import a website"
        lede={<>
          Bring in a site that has no API — a hand-written one, a Webflow or Wix export, a site-builder
          template — from its web address or from a ZIP of its files. Each page arrives as a draft laid out
          in sections, with its pictures, menus, search-engine details and redirects. The site is read first and
          nothing is written until you have seen what will come across, what will not, and why.
        </>}
      />

      <SiteImportWizard active={index.meta.active} history={index.data} queue={queue} limits={index.meta.limits} chunkBytes={index.meta.chunk_bytes} />
    </>
  );
}
