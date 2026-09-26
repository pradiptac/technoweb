import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getNewsletterQueue, getWordPressImports } from "@/lib/admin";
import { requireScreen } from "@/lib/admin-screen";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { QueueHealth, WordPressImportIndex } from "@/types/api";
import { WordPressImportWizard } from "./wordpress-wizard";

export const metadata = buildMetadata({ title: "Import from WordPress", path: "/admin/imports/wordpress", seo: noIndex });

export default async function WordPressImportPage() {
  await requireScreen();
  let index: WordPressImportIndex;
  let queue: QueueHealth | null;

  try {
    [index, queue] = await Promise.all([getWordPressImports(), getNewsletterQueue().catch(() => null)]);
  } catch {
    return <ErrorState title="We could not load this screen">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader
        title="Import from WordPress"
        lede={<>
          Bring a WordPress site across — posts, pages, media, SEO, menus and, with WooCommerce, the
          shop&apos;s products, customers, coupons, orders and reviews. The site is read first and
          nothing is written until you have seen what will come across, what will not, and why.
        </>}
      />

      <WordPressImportWizard active={index.meta.active} history={index.data} queue={queue} />
    </>
  );
}
