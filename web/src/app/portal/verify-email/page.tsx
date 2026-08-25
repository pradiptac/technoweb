import Link from "next/link";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Alert } from "@/components/ui/input";
import { ButtonLink } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { verifyCustomerEmail } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ResendButton } from "../register/check-your-email/resend-button";

export const metadata = buildMetadata({
  title: "Confirm your email address",
  description: "Confirming your address for the Technoware support portal.",
  path: "/portal/verify-email",
  seo: noIndex,
});

type Outcome =
  | { kind: "ok"; canSignIn: boolean; message: string }
  | { kind: "already" }
  | { kind: "invalid" }
  | { kind: "missing" }
  | { kind: "unreachable" };

/**
 * The page the emailed link opens.
 *
 * The token is spent on render rather than behind a button. A confirmation
 * link that lands on a page saying "click here to confirm" is asking somebody
 * to do the same thing twice, and the second click is the one that gets lost.
 *
 * That does mean the request runs on a GET, which is normally the wrong verb
 * for something that changes state. It is acceptable here for the same reason
 * a password-reset link is: the token is single-use, expires in 24 hours, and
 * arrives only in the inbox it proves control of. What it must *not* be is
 * cached — hence `dynamic`, below.
 */
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const { token, email } = await searchParams;
  const settings = await getSiteSettings();

  const outcome: Outcome = await (async () => {
    if (!token || !email) return { kind: "missing" as const };

    try {
      const result = await verifyCustomerEmail(email, token);

      if (result.already_verified) return { kind: "already" as const };

      return {
        kind: "ok" as const,
        canSignIn: result.status === "active",
        message: result.message,
      };
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) return { kind: "invalid" as const };
      return { kind: "unreachable" as const };
    }
  })();

  const heading =
    outcome.kind === "ok" || outcome.kind === "already"
      ? "Address confirmed"
      : "We could not confirm that";

  return (
    <AuthLayout settings={settings} title={heading}>
      {outcome.kind === "ok" && (
        <>
          <Alert tone="ok" title="Thank you">
            {outcome.message}
          </Alert>

          {outcome.canSignIn ? (
            <ButtonLink href="/portal/login" className="mt-2 w-full">
              Sign in to the portal
            </ButtonLink>
          ) : (
            <p className="text-[14.5px] leading-relaxed text-muted">
              There is nothing more for you to do. One of our engineers will check the account
              against your support agreement and switch it on — you will get an email the moment
              that happens.
            </p>
          )}
        </>
      )}

      {outcome.kind === "already" && (
        <>
          <Alert tone="info" title="Already done">
            That address was confirmed earlier, so this link has nothing left to do.
          </Alert>
          <ButtonLink href="/portal/login" className="mt-2 w-full">
            Go to sign in
          </ButtonLink>
        </>
      )}

      {outcome.kind === "invalid" && (
        <>
          <Alert tone="err" title="That link is no longer valid">
            Confirmation links work once and expire after 24 hours. Ask for a fresh one and it will
            be in your inbox in a minute.
          </Alert>
          {/*
            Only offered when the URL carried an address. Without one there is
            nothing to send to, and a button that cannot work is worse than no
            button.
          */}
          {email ? (
            <ResendButton email={email} />
          ) : (
            <ButtonLink href="/portal/login" className="mt-2 w-full">
              Back to sign in
            </ButtonLink>
          )}
        </>
      )}

      {outcome.kind === "missing" && (
        <Alert tone="err" title="Something is missing from that link">
          It looks like the address got cut off on its way here — some email clients wrap long
          links. Try copying the whole thing from the email into your browser.
        </Alert>
      )}

      {outcome.kind === "unreachable" && (
        <Alert tone="err" title="We could not reach the support system">
          Nothing has been lost. Try the link again in a few minutes.
        </Alert>
      )}

      <p className="mt-6 text-center text-[13.5px]">
        <Link href="/portal/login" className="font-semibold text-brand-ink hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
