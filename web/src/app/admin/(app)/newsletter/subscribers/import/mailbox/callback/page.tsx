import { Alert } from "@/components/ui/input";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { finishNewsletterConnection } from "../mailbox-actions";

export const metadata = buildMetadata({
  title: "Connecting a mailbox to scan", path: "/admin/newsletter/subscribers/import/mailbox/callback", seo: noIndex,
});

/**
 * Where Google or Microsoft sends the browser back to after consenting to
 * the mailbox a subscriber scan reads.
 *
 * The third consent callback in the console, on its own path: the API
 * accepts exactly this one for the newsletter's slot and refuses the two
 * Settings paths, so a consent started here cannot be spent as the sending
 * mailbox or the ticket mailbox. Inside the admin (app) group so the session
 * guard runs before the code is exchanged; exchanged on render because the
 * code is single-use and short-lived.
 */
export default async function MailboxScanCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string; error?: string; error_description?: string }>;
}) {
  const params = await searchParams;
  const back = "/admin/newsletter/subscribers/import/mailbox";

  const declined = params.error === "access_denied";
  const result = params.code && params.state
    ? await finishNewsletterConnection(params.code, params.state)
    : null;

  return (
    <>
      <PageHeader title="Connecting a mailbox to scan" back={{ href: back, label: "Import from a mailbox" }} />

      {declined ? (
        <Alert tone="info" title="Nothing was connected">
          The request was cancelled, so no access was granted and nothing here changed.
        </Alert>
      ) : params.error ? (
        <Alert tone="err" title="The request was refused">
          {params.error_description ?? params.error}
          <span className="mt-1 block">
            A <code className="font-mono">redirect_uri_mismatch</code> means the address below is not one of the
            authorised redirect URIs on the OAuth client saved under Settings → Ticketing:
            <code className="mt-1 block font-mono text-12-5 [overflow-wrap:anywhere]">/admin/newsletter/subscribers/import/mailbox/callback</code>
          </span>
        </Alert>
      ) : result?.error ? (
        <Alert tone="err" title="That did not complete">{result.error}</Alert>
      ) : result?.ok ? (
        <Alert tone="ok" title="Mailbox connected">
          <strong>{result.ok}</strong> can be scanned now. The consent is used for that one scan and forgotten when
          it finishes.
        </Alert>
      ) : (
        <Alert tone="warn" title="Nothing to do">
          This page is where the provider sends you back to after approving access. It has nothing to show on its own.
        </Alert>
      )}

      <div className="mt-4">
        <ButtonLink href={back} size="sm">{result?.ok ? "Scan the mailbox" : "Back to the import screen"}</ButtonLink>
      </div>
    </>
  );
}
