"use client";

import Link from "next/link";
import { Container } from "@/components/ui/container";
import { setConsent, useConsent } from "@/lib/consent";
import type { SiteSettings } from "@/lib/site-settings";

/**
 * The cookie banner.
 *
 * It genuinely gates the trackers — `Analytics` renders nothing until a choice
 * of "granted" is recorded here. A banner that appears while the tags load
 * anyway is worse than no banner at all, because it claims a consent that was
 * never obtained.
 *
 * Deliberately not mounted when there is nothing to consent to: with no
 * analytics ID configured no cookie is ever set, and asking would be theatre.
 * That check is in `(marketing)/layout.tsx`.
 *
 * Every string is editable in Settings; this supplies only the behaviour.
 */
export function CookieConsent({ settings }: { settings: SiteSettings }) {
  const choice = useConsent();

  // null means "not answered yet" on the client, and also what the server
  // renders — but useSyncExternalStore gives the real value on hydration, so
  // this does not flash for someone who already chose.
  if (choice !== null) return null;

  const title = settings.cookie_consent_title ?? "Cookies on this site";
  const message = settings.cookie_consent_message
    ?? "We use analytics cookies to understand how visitors use this site. They are optional.";
  const accept = settings.cookie_consent_accept_label ?? "Accept analytics";
  const reject = settings.cookie_consent_reject_label ?? "Decline";
  const policy = settings.cookie_consent_policy_url;

  return (
    <div
      // A region, not a dialog: a dialog would take focus and interrupt
      // someone mid-sentence over something optional. This announces itself to
      // a screen reader without seizing the page.
      role="region"
      aria-label={title}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line-strong bg-card shadow-[0_-4px_24px_rgba(18,20,13,.10)]"
    >
      <Container className="flex flex-wrap items-center gap-x-8 gap-y-4 py-4">
        <div className="min-w-[min(100%,320px)] flex-1">
          <p className="text-[14.5px] font-semibold">{title}</p>
          <p className="mt-1 max-w-[78ch] text-[13.5px] leading-[1.55] text-muted">
            {message}{" "}
            {policy && (
              <Link href={policy} className="font-semibold text-brand-ink hover:underline">
                Read more
              </Link>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => setConsent("denied")}
            className="rounded border border-line-strong bg-card px-4 py-2.5 text-[13.5px] font-semibold transition-colors hover:border-faint"
          >
            {reject}
          </button>
          <button
            type="button"
            onClick={() => setConsent("granted")}
            className="rounded bg-ink px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-ink-2"
          >
            {accept}
          </button>
        </div>
      </Container>
    </div>
  );
}
