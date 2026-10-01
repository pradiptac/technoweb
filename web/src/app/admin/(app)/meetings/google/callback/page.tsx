import { Alert } from "@/components/ui/input";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { finishMeetingsGoogleConnection } from "../../actions";

export const metadata = buildMetadata({
  title: "Connecting Google Calendar", path: "/admin/meetings/google/callback", seo: noIndex,
});

/**
 * Where Google sends the browser back to after the Workspace account every
 * meeting is organised on has consented. The backup Drive callback's twin
 * on its own path: the API accepts exactly this path for this slot, so a
 * consent started for meetings cannot be spent anywhere else. Inside the
 * admin group so the session guard runs before the single-use code is
 * exchanged on render; the exchange itself is `role:admin` at the API.
 */
export default async function MeetingsGoogleCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string; error?: string; error_description?: string }>;
}) {
  await requireScreen();
  const params = await searchParams;

  const declined = params.error === "access_denied";
  const result = params.code && params.state ? await finishMeetingsGoogleConnection(params.code, params.state) : null;

  return (
    <>
      <PageHeader title="Connecting Google Calendar" back={{ href: "/admin/meetings/settings", label: "Meeting settings" }} />

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
            <code className="mt-1 block font-mono text-12-5">/admin/meetings/google/callback</code>
          </span>
        </Alert>
      ) : result?.error ? (
        <Alert tone="err" title="That did not complete">{result.error}</Alert>
      ) : result?.ok ? (
        <Alert tone="ok" title="Google Calendar connected">
          Meetings are organised on <strong>{result.ok}</strong>&apos;s calendar from now on, with a Meet link on each.
          Test it from Meeting settings.
        </Alert>
      ) : (
        <Alert tone="warn" title="Nothing to do">
          This page is where Google sends you back to after approving access. It has nothing to show on its own.
        </Alert>
      )}

      <div className="mt-4">
        <ButtonLink href="/admin/meetings/settings" size="sm">Back to Meeting settings</ButtonLink>
      </div>
    </>
  );
}
