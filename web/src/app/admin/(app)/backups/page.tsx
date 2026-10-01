import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty";
import { getBackups } from "@/lib/admin";
import { requireScreen } from "@/lib/admin-screen";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { BackupIndex } from "@/types/api";
import { BackupsScreen } from "./backups-screen";

export const metadata = buildMetadata({ title: "Backups", path: "/admin/backups", seo: noIndex });

/**
 * Backups (2026-09-27, docs/backups.md): what exists, where each one reached,
 * "Back up now", and restoring — from a backup this server remembers or from
 * a folder found on a destination, which is the fresh-server case.
 */
export default async function BackupsPage() {
  await requireScreen();
  let index: BackupIndex;

  try {
    index = await getBackups();
  } catch {
    return <ErrorState title="We could not load this screen">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader
        title="Backups"
        lede={<>
          The database and the uploaded files — the media library, ticket attachments, CVs and invoices —
          copied to the destinations switched on under Backup settings. A full backup copies everything;
          an incremental copies the files that changed since the one before it.
        </>}
      >
        <ButtonLink href="/admin/backups/settings" variant="secondary" size="sm" className="ml-auto">Backup settings</ButtonLink>
      </PageHeader>

      <BackupsScreen initial={index} />
    </>
  );
}
