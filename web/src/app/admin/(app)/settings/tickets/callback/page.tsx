import Link from "next/link";
import { Alert } from "@/components/ui/input";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { finishInboundConnection } from "../../tickets-actions";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({
  title: "Connecting the support mailbox", path: "/admin/settings/tickets/callback", seo: noIndex,
});

/**
 * Where Google or Microsoft sends the browser back to after consenting to
 * the mailbox tickets are read from.
 *
 * The outgoing mail callback's twin, on its own path: the API accepts exactly
 * this path for this slot and refuses the mail one, so a consent started
 * from the Ticketing panel cannot be spent as the sending mailbox. Like the
 * twin it sits inside the admin (app) group so the session guard runs before
 * the code is exchanged, and it exchanges on render because the code is
 * single-use and short-lived.
 */
export default async function TicketsCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string; error?: string; error_description?: string }>;
}) {
  await requireScreen();
  const params = await searchParams;

  const declined = params.error === "access_denied";
  const result = params.code && params.state
    ? await finishInboundConnection(params.code, params.state)
    : null;

  return (
    <>
      <PageHeader title="Connecting the support mailbox" back={{ href: "/admin/tickets/settings", label: "Email to ticket" }} />

      {declined ? (
        <Alert tone="info" title="Nothing was connected">
          The request was cancelled, so no access was granted and nothing here changed.
        </Alert>
      ) : params.error ? (
        <Alert tone="err" title="The request was refused">
          {params.error_description ?? params.error}
          <span className="mt-1 block">
            A <code className="font-mono">redirect_uri_mismatch</code> means the
            address below is not one of the authorised redirect URIs on your
            OAuth client or app registration:
            <code className="mt-1 block font-mono text-12-5">
              /admin/settings/tickets/callback
            </code>
          </span>
        </Alert>
      ) : result?.error ? (
        <Alert tone="err" title="That did not complete">{result.error}</Alert>
      ) : result?.ok ? (
        <Alert tone="ok" title="Mailbox connected">
          Tickets will be read from <strong>{result.ok}</strong> once email piping is
          switched on. Check the connection from Tickets → Email to ticket to confirm it reads.
        </Alert>
      ) : (
        <Alert tone="warn" title="Nothing to do">
          This page is where the provider sends you back to after approving access.
          It has nothing to show on its own.
        </Alert>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <ButtonLink href="/admin/tickets/settings" size="sm">Back to Email to ticket</ButtonLink>
        <Link href="/admin/tickets" className="text-13 font-semibold text-brand-ink hover:underline">
          Open the ticket queue
        </Link>
      </div>
    </>
  );
}
