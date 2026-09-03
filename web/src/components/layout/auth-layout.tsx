import Image from "next/image";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { CreditLine } from "@/components/layout/credit-line";
import { Logo } from "@/components/layout/logo";
import { AreaSchemeToggle } from "@/components/ui/scheme-toggle";
import type { SiteSettings } from "@/lib/site-settings";

/**
 * The split screen behind every sign-in, forgot-password and reset screen —
 * staff and customer alike.
 *
 * The image is configurable (`login_image_path` in Settings) and the panel is
 * simply omitted when none is set, rather than showing a grey rectangle. On
 * anything narrower than a laptop the panel is hidden entirely: on a phone it
 * would push the form below the fold, which is a decorative image costing
 * somebody their login.
 *
 * `<main>` lives here because these pages sit outside every route group that
 * supplies one, and the skip link targets `#main`.
 */
export function AuthLayout({
  settings, title, lede, children, footer,
}: {
  settings: SiteSettings;
  title: string;
  lede?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const image = settings.login_image_url;
  const caption = settings.tagline;

  return (
    /*
      The panel is the larger half only when there is a photograph in it.

      With none configured — the state this ships in — it was 1.05fr against
      1fr: 51% of a 1321px screen, 677px of empty dark grid holding a wordmark
      and one line of tagline pinned to the bottom corner. The decoration was
      literally bigger than the thing people came to use. Unconfigured it is
      now a .62fr rail, and the lockup is centred in it rather than dropped in
      a corner, so it reads as deliberate rather than as an image that failed
      to load.
    */
    <main
      id="main"
      className={cn(
        "grid min-h-screen",
        /*
          An even split once there is a picture: the image takes half the
          screen and the form takes the other half.

          The `.62fr` rail is the *unconfigured* case and is deliberately not
          half — that is what the paragraph above is about. Giving empty dark
          grid half the viewport was the thing that was wrong with it, so the
          two cases share a component and not a ratio.
        */
        image ? "lg:grid-cols-2" : "lg:grid-cols-[.62fr_1fr]",
      )}
    >
      {/* Decorative, so it comes second in the DOM and first visually — a
          screen reader reaches the form without wading through it. */}
      <div className="relative order-2 hidden overflow-hidden bg-dark lg:order-1 lg:block">
        {image ? (
          <>
            <Image
              src={image}
              alt=""
              fill
              sizes="(min-width: 1024px) 52vw, 0px"
              className="object-cover"
              priority
              unoptimized
            />
            {/* Keeps the caption legible whatever the photograph is. */}
            <div className="absolute inset-0 bg-linear-to-t from-[rgba(18,20,13,.88)] via-[rgba(18,20,13,.35)] to-transparent" />
          </>
        ) : (
          /*
            One background-image, three layers, in that order.

            It used to be `bg-linear-135 from-brand-900 to-brand-700` *and* an
            arbitrary `[background-image:...]` for the grid — two declarations
            of the same property, so the second silently replaced the first and
            the brand gradient never rendered at all. What showed was the
            parent's near-black `bg-dark` behind a faint grid, which is exactly
            the "empty dark panel" the audit described.

            background-size has to name a value per layer for the same reason:
            a single `52px 52px` would tile the gradient too, repeating it 25
            times across the panel instead of running it corner to corner.
          */
          <div
            aria-hidden
            className="absolute inset-0 opacity-95 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(135deg,var(--color-brand-900),var(--color-brand-700))] [background-size:52px_52px,52px_52px,100%_100%]"
          />
        )}

        {/*
          The logo used to live here too, stacked above the caption. It now
          lives only on the form panel, at every width — see below — so this
          panel is purely decorative: the photograph or the gradient, and the
          tagline if one is configured. Nothing renders here at all when
          neither is set, which is fine: the panel is `aria-hidden` in effect
          already, being decorative and ordered second for a screen reader.
        */}
        {caption && (
          <div className={cn("relative flex h-full flex-col p-12", image ? "justify-end" : "justify-center")}>
            <p className="max-w-[38ch] font-display text-[22px] leading-[1.35] tracking-[-.02em] text-white">
              {caption}
            </p>
          </div>
        )}
      </div>

      {/*
        `min-w-0`: a grid item's automatic minimum width is its min-content,
        and the nowrap copyright line far below has a wide one — without
        this, that single long line forces the whole panel, and the page
        with it, wider than the viewport. Same trap this project has hit
        before on a truncated table cell and a media URL in a block list.
      */}
      <div className="order-1 flex min-w-0 flex-col px-6 py-12 sm:px-10 lg:order-2 lg:px-14">
        {/*
          `flex-1` so this block — not the whole panel — is what centres
          vertically. The copyright line below is a sibling rather than a
          child of it, which is what pins it to the true bottom of the panel
          instead of just being last inside whatever height the centred form
          happens to be.
        */}
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center">
          {/*
            Shown at every width now, not just below `lg`. This used to be the
            mobile-only stand-in for the logo living in the decorative panel —
            now that the panel carries no logo at all, this is the only one on
            the page, so it can no longer be conditional.
          */}
          <Link href="/" className="auth-rise mb-9 inline-block">
            <Logo
              logoUrl={settings.logo_url}
              logoWidth={settings.logo_width}
              logoHeight={settings.logo_height}
              companyName={settings.company_name}
            />
          </Link>

          {/*
            Three steps, not one: the mark, then what this screen is, then the
            form. Staggered by 70ms, which is enough to read as deliberate and
            short enough that somebody who came here to type a password is not
            waiting on it.
          */}
          <div className="auth-rise auth-rise-delay-1">
            <h1 className="display-3">{title}</h1>
            {lede && <p className="mt-2.5 mb-7 text-[15px] leading-[1.6] text-muted">{lede}</p>}
            {!lede && <div className="mb-7" />}
          </div>

          <div className="auth-rise auth-rise-delay-2">{children}</div>

          {footer && <div className="mt-8 border-t border-line pt-6 text-[13.5px] text-muted">{footer}</div>}

          {/*
            The scheme control belongs here too, not only behind the login.
            These screens paint from the OS correctly, but somebody who prefers
            dark had no way to say so until they were through the door — and on
            the reset-password screens there is no door to get through.
          */}
          <div className="mt-8 flex items-center gap-4">
            <p className="text-[13px] text-faint">
              <Link href="/" className="hover:text-muted hover:underline">← Back to the site</Link>
            </p>
            <AreaSchemeToggle className="ml-auto" />
          </div>
        </div>

        {/*
          Outside the centred block, so it sits at the true bottom of the
          panel — not just last inside a form that happens to be short enough
          to leave it mid-screen. Copyright reads last everywhere else it
          appears on this site (the public footer, the signed-in app layouts).

          Not capped to the form's own 400px column: the sentence is long
          enough (~85 characters) that 400px forces it onto two lines, and it
          is meant to read as one. Left at the panel's own width instead —
          the panel is wider than 400px from `sm` up, which is most of the
          room it needs.

          `overflow-x-auto` on the wrapper is the safety net for the widths
          where even that is not enough: a phone at 320–360px genuinely
          cannot fit 85 characters on one line at a legible size, so rather
          than either wrapping (what was asked to stop) or shrinking the text
          past reading (illegible), the line can scroll on its own — which
          this project's own audit already treats as contained, not as page
          overflow, the same rule that keeps a decorative background element
          out of the horizontal-overflow check.
        */}
        <div className="min-w-0 border-t border-line pt-5 pb-2 text-center text-[12px] text-faint">
          <div className="min-w-0 overflow-x-auto">
            <CreditLine
              companyName={settings.company_name ?? "Technoware"}
              className="inline-block whitespace-nowrap"
              linkClassName="font-medium text-faint hover:text-muted hover:underline"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
