import Link from "next/link";
import { Alert } from "@/components/ui/input";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { finishMailConnection } from "../../mail-actions";

export const metadata = buildMetadata({
  title: "Connecting a mailbox", path: "/admin/settings/mail/callback", seo: noIndex,
});

/**
 * Where Google sends the browser back to.
 *
 * This exact path is what gets registered as the authorised redirect URI, so
 * it must stay put: changing it means changing it in the Google Cloud console
 * too, and a mismatch there fails with `redirect_uri_mismatch` before anybody
 * reaches this page.
 *
 * It sits inside the admin (app) group deliberately. The code that arrives
 * here is exchanged using credentials only a signed-in administrator may
 * touch, so the layout's session guard is doing real work — an unauthenticated
 * hit is redirected to the login screen rather than being allowed to spend the
 * authorisation code.
 *
 * The exchange happens on this render rather than behind a button. The code is
 * single-use and short-lived, and a page that waits for a click is a page that
 * hands somebody an expired code and no way to tell why.
 */
export default async function MailCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string; error?: string; error_description?: string }>;
}) {
  const params = await searchParams;

  // Google reports a refused consent in the query string rather than by not
  // coming back at all, and "access_denied" is what pressing Cancel looks
  // like — which is a normal thing to do, not a failure to apologise for.
  const declined = params.error === "access_denied";
  const result = params.code && params.state
    ? await finishMailConnection(params.code, params.state)
    : null;

  return (
    <>
      <PageHeader title="Connecting a mailbox" back={{ href: "/admin/settings", label: "Settings" }} />

      {declined ? (
        <Alert tone="info" title="Nothing was connected">
          The request was cancelled at Google, so no access was granted and
          nothing here changed.
        </Alert>
      ) : params.error ? (
        <Alert tone="err" title="Google refused the request">
          {params.error_description ?? params.error}
          <span className="mt-1 block">
            A <code className="font-mono">redirect_uri_mismatch</code> means the
            address below is not one of the authorised redirect URIs on your
            OAuth client:
            <code className="mt-1 block font-mono text-[12.5px]">
              /admin/settings/mail/callback
            </code>
          </span>
        </Alert>
      ) : result?.error ? (
        <Alert tone="err" title="That did not complete">{result.error}</Alert>
      ) : result?.ok ? (
        <Alert tone="ok" title="Mailbox connected">
          Outgoing mail will now go through <strong>{result.ok}</strong>. Send a
          test message from Settings to confirm it works end to end.
        </Alert>
      ) : (
        <Alert tone="warn" title="Nothing to do">
          This page is where Google sends you back to after approving access. It
          has nothing to show on its own.
        </Alert>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <ButtonLink href="/admin/settings" size="sm">Back to settings</ButtonLink>
        {result?.ok && (
          <Link href="/admin/settings" className="self-center text-[13px] text-muted hover:underline">
            Send a test message from there
          </Link>
        )}
      </div>
    </>
  );
}
