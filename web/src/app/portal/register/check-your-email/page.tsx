import Link from "next/link";
import { AuthLayout } from "@/components/layout/auth-layout";
import { getSiteSettings } from "@/lib/settings";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ResendButton } from "./resend-button";

export const metadata = buildMetadata({
  title: "Check your email",
  description: "Confirm your address to finish registering for the Technoware support portal.",
  path: "/portal/register/check-your-email",
  seo: noIndex,
});

export default async function CheckYourEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const settings = await getSiteSettings();

  return (
    <AuthLayout
      settings={settings}
      title="Check your email"
      lede={
        email
          ? `We have sent a confirmation link to ${email}.`
          : "We have sent you a confirmation link."
      }
    >
      <div className="text-[14.5px] leading-relaxed text-muted">
        <p>Two things happen next, in this order:</p>

        {/*
          Both steps are spelled out because the second one is the surprise.
          People expect a confirmation link to be the end of it, and an account
          that still will not sign in after they have clicked one reads as
          broken rather than as pending.
        */}
        <ol className="mt-3 space-y-3">
          <li className="flex gap-3">
            <span className="mt-px grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[12.5px] font-semibold text-brand-ink">
              1
            </span>
            <span>
              <strong className="font-semibold text-ink">You confirm your address.</strong> Click
              the link in the email. It expires in 24 hours.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-px grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[12.5px] font-semibold text-brand-ink">
              2
            </span>
            <span>
              <strong className="font-semibold text-ink">We activate the account.</strong> One of
              our engineers checks it against your support agreement and switches it on. You will
              get another email when that is done.
            </span>
          </li>
        </ol>

        <p className="mt-5">
          Nothing in your inbox? It can take a minute, and it sometimes lands in spam.
        </p>
      </div>

      {email && <ResendButton email={email} />}

      <p className="mt-6 text-center text-[13.5px]">
        <Link href="/portal/login" className="font-semibold text-brand-ink hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
