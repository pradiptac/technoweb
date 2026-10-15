import { Alert } from "@/components/ui/input";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { finishZohoBooksConnection } from "../../../../settings/zoho-actions";

export const metadata = buildMetadata({
  title: "Connecting Zoho Books", path: "/admin/store/settings/zoho/callback", seo: noIndex,
});

const BACK = "/admin/store/settings?tab=zoho_books";

/**
 * Where Zoho sends the browser back to after an administrator has agreed to
 * let this site make invoices (docs/store.md "Zoho Books invoices"). The
 * calendar and Drive callbacks' twin on its own path: the API accepts
 * exactly this path for this connection, so a consent started here cannot be
 * spent anywhere else. Inside the admin group, so the session guard runs
 * before the single-use code is exchanged on render; the exchange itself is
 * `role:admin` at the API.
 */
export default async function ZohoBooksCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string; error?: string }>;
}) {
  await requireScreen();
  const params = await searchParams;

  const declined = params.error === "access_denied";
  const result = params.code && params.state ? await finishZohoBooksConnection(params.code, params.state) : null;

  return (
    <>
      <PageHeader title="Connecting Zoho Books" back={{ href: BACK, label: "Store settings" }} />

      {declined ? (
        <Alert tone="info" title="Nothing was connected">
          The request was cancelled, so no access was granted and nothing here changed.
        </Alert>
      ) : params.error ? (
        <Alert tone="err" title="Zoho refused the request">
          Zoho answered <code className="font-mono">{params.error.slice(0, 80)}</code>. Check that the client is a
          Server-based Application, that this address is its redirect address, and that the data centre chosen in
          Store settings is the one your Zoho account is in.
          <code className="mt-1 block font-mono text-12-5">/admin/store/settings/zoho/callback</code>
        </Alert>
      ) : result?.error ? (
        <Alert tone="err" title="That did not complete">{result.error}</Alert>
      ) : result?.ok ? (
        <Alert tone="ok" title="Zoho Books connected">
          Connected to <strong>{result.ok}</strong>. Next, in Store settings: choose the organisation and save, then
          choose the two taxes and switch it on.
        </Alert>
      ) : (
        <Alert tone="warn" title="Nothing to do">
          This page is where Zoho sends you back to after approving access. It has nothing to show on its own.
        </Alert>
      )}

      <div className="mt-4">
        <ButtonLink href={BACK} size="sm">Back to Store settings</ButtonLink>
      </div>
    </>
  );
}
