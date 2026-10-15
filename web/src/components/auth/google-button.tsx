import { ButtonAnchor } from "@/components/ui/button";
import { GOOGLE_START_PATH } from "@/lib/google-signin";

/**
 * "Continue with Google" (docs/auth.md "Signing in with Google"), with the
 * "or" that separates it from the form under it.
 *
 * A plain `<a>` at a route handler — `ButtonAnchor`, never `ButtonLink`: a
 * `next/link` prefetches what it points at, and this handler mints a sign-in
 * attempt and sets a cookie every time it is asked.
 *
 * The mark is Google's four-colour "G" drawn from the `--color-g-*` tokens,
 * which are the brand's own hues held to 3:1 on a card in both schemes; the
 * button itself is the neutral outlined one, as Google's guidelines ask.
 * `returnTo` is where the customer lands afterwards and is narrowed again by
 * the handler (`safeReturnPath`).
 */
export function GoogleButton({ label = "Continue with Google", returnTo }: { label?: string; returnTo?: string }) {
  const href = returnTo ? `${GOOGLE_START_PATH}?return=${encodeURIComponent(returnTo)}` : GOOGLE_START_PATH;

  return (
    <div data-google-signin>
      <ButtonAnchor href={href} variant="secondary" className="w-full gap-2.5" rel="nofollow">
        <GoogleMark />
        {label}
      </ButtonAnchor>

      <p className="my-5 flex items-center gap-3 text-12-5 text-muted" aria-hidden>
        <span className="h-px flex-1 bg-line-strong" />
        or
        <span className="h-px flex-1 bg-line-strong" />
      </p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className="shrink-0">
      <path style={{ fill: "var(--color-g-blue)" }} d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.2 3.5-8.8Z" />
      <path style={{ fill: "var(--color-g-green)" }} d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8h-4v3.1A12 12 0 0 0 12 24Z" />
      <path style={{ fill: "var(--color-g-yellow)" }} d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path style={{ fill: "var(--color-g-red)" }} d="M12 4.8c1.8 0 3.3.6 4.6 1.8L20 3.1A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z" />
    </svg>
  );
}
