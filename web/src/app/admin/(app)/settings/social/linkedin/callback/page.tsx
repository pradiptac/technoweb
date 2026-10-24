import { Alert } from "@/components/ui/input";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { finishLinkedInConnection } from "../../../social-actions";

export const metadata = buildMetadata({
  title: "Connecting LinkedIn", path: "/admin/settings/social/linkedin/callback", seo: noIndex,
});

/**
 * Where LinkedIn sends the browser back to after the company page's
 * administrator has consented. The meetings calendar callback's twin on its
 * own path: the API accepts exactly this path for this slot, so a consent
 * started for LinkedIn cannot be spent anywhere else. Inside the admin group
 * so the session guard runs before the single-use code is exchanged on
 * render; the exchange itself is `role:admin` at the API.
 */
export default async function LinkedInCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string; error?: string; error_description?: string }>;
}) {
  await requireScreen();
  const params = await searchParams;

  const declined = params.error === "access_denied" || params.error === "user_cancelled_authorize";
  const result = params.code && params.state ? await finishLinkedInConnection(params.code, params.state) : null;

  return (
    <>
      <PageHeader title="Connecting LinkedIn" back={{ href: "/admin/settings/social", label: "Social accounts" }} />

      {declined ? (
        <Alert tone="info" title="Nothing was connected">
          The request was cancelled, so no access was granted and nothing here changed.
        </Alert>
      ) : params.error ? (
        <Alert tone="err" title="LinkedIn refused the request">
          {params.error_description ?? params.error}
          <span className="mt-1 block">
            A redirect mismatch means this address is not one of the authorised redirect URLs on the LinkedIn app:
            <code className="mt-1 block font-mono text-12-5">/admin/settings/social/linkedin/callback</code>
          </span>
        </Alert>
      ) : result?.error ? (
        <Alert tone="err" title="That did not complete">{result.error}</Alert>
      ) : result?.ok ? (
        <Alert tone="ok" title="LinkedIn connected">
          {result.ok === "LinkedIn" ? "Your account is connected." : <>Signed in as <strong>{result.ok}</strong>.</>} Choose which LinkedIn page posts go to from Social accounts.
        </Alert>
      ) : (
        <Alert tone="warn" title="Nothing to do">
          This page is where LinkedIn sends you back to after approving access. It has nothing to show on its own.
        </Alert>
      )}

      <div className="mt-4">
        <ButtonLink href="/admin/settings/social" size="sm">Back to Social accounts</ButtonLink>
      </div>
    </>
  );
}
