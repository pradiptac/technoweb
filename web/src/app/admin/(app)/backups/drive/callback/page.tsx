import { Alert } from "@/components/ui/input";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { finishDriveConnection } from "../../actions";

export const metadata = buildMetadata({
  title: "Connecting Google Drive", path: "/admin/backups/drive/callback", seo: noIndex,
});

/**
 * Where Google sends the browser back to after consenting to the Drive
 * backups are kept in. The ticket mailbox callback's twin on its own path:
 * the API accepts exactly this path for this slot, so a consent started for
 * backups cannot be spent as a mailbox. Inside the admin group so the
 * session guard runs before the single-use code is exchanged on render.
 */
export default async function BackupDriveCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string; error?: string; error_description?: string }>;
}) {
  await requireScreen();
  const params = await searchParams;

  const declined = params.error === "access_denied";
  const result = params.code && params.state ? await finishDriveConnection(params.code, params.state) : null;

  return (
    <>
      <PageHeader title="Connecting Google Drive" back={{ href: "/admin/backups/settings", label: "Backup settings" }} />

      {declined ? (
        <Alert tone="info" title="Nothing was connected">
          The request was cancelled, so no access was granted and nothing here changed.
        </Alert>
      ) : params.error ? (
        <Alert tone="err" title="Google refused the request">
          {params.error_description ?? params.error}
          <span className="mt-1 block">
            A <code className="font-mono">redirect_uri_mismatch</code> means this address is not one of the authorised
            redirect URIs on the OAuth client:
            <code className="mt-1 block font-mono text-12-5">/admin/backups/drive/callback</code>
          </span>
        </Alert>
      ) : result?.error ? (
        <Alert tone="err" title="That did not complete">{result.error}</Alert>
      ) : result?.ok ? (
        <Alert tone="ok" title="Google Drive connected">
          Backups go to <strong>{result.ok}</strong>’s Drive, in a folder called technoware-backups, once Google Drive is
          switched on. Test it from Backup settings.
        </Alert>
      ) : (
        <Alert tone="warn" title="Nothing to do">
          This page is where Google sends you back to after approving access. It has nothing to show on its own.
        </Alert>
      )}

      <div className="mt-4">
        <ButtonLink href="/admin/backups/settings" size="sm">Back to Backup settings</ButtonLink>
      </div>
    </>
  );
}
