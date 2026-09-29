import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty";
import { getUpdates } from "@/lib/admin";
import { requireScreen } from "@/lib/admin-screen";
import { noIndex } from "@/lib/no-index";
import { buildMetadata } from "@/lib/seo";
import type { UpdatesIndex } from "@/types/system";
import { UpdatesScreen } from "./updates-screen";

export const metadata = buildMetadata({ title: "Updates", path: "/admin/system/updates", seo: noIndex });

/**
 * System → Updates (docs/distribution.md, MANUAL/21-updating.md): the release
 * zips your supplier sent, checked, and applied from here — safety copy,
 * maintenance window, migrations, restart and all — with the previous version
 * kept for one rollback.
 */
export default async function UpdatesPage() {
  await requireScreen();
  let index: UpdatesIndex;

  try {
    index = await getUpdates();
  } catch {
    return <ErrorState title="We could not load this screen">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader
        title="Updates"
        lede={<>
          Apply a new version your supplier sent you. Upload the zip here, or put it in the
          {" "}<code className="font-mono">updates</code> folder with FTP or the hosting panel&apos;s File Manager.
          A safety copy of the database is taken first, and the version before is kept so it can be put back.
        </>}
      >
        <ButtonLink href="/admin/system/status" variant="secondary" size="sm" className="ml-auto">System status</ButtonLink>
      </PageHeader>

      <UpdatesScreen initial={index} />
    </>
  );
}
