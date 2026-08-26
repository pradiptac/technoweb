import Image from "next/image";
import { cn } from "@/lib/utils";
import Link from "next/link";
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
        image ? "lg:grid-cols-[1.05fr_1fr]" : "lg:grid-cols-[.62fr_1fr]",
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

        <div className={cn("relative flex h-full flex-col p-12", image ? "justify-end" : "justify-center")}>
          <Logo onDark logoUrl={settings.logo_url} companyName={settings.company_name} />
          {caption && (
            <p className="mt-4 max-w-[38ch] font-display text-[22px] leading-[1.35] tracking-[-.02em] text-white">
              {caption}
            </p>
          )}
        </div>
      </div>

      <div className="order-1 flex flex-col justify-center px-6 py-12 sm:px-10 lg:order-2 lg:px-14">
        <div className="mx-auto w-full max-w-[400px]">
          <Link href="/" className="mb-9 inline-block lg:hidden">
            <Logo logoUrl={settings.logo_url} companyName={settings.company_name} />
          </Link>

          <h1 className="display-3">{title}</h1>
          {lede && <p className="mt-2.5 mb-7 text-[15px] leading-[1.6] text-muted">{lede}</p>}
          {!lede && <div className="mb-7" />}

          {children}

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
      </div>
    </main>
  );
}
