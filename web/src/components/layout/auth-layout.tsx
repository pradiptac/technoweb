import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
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
    <main id="main" className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
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
          <div
            aria-hidden
            className="absolute inset-0 bg-linear-135 from-brand-900 to-brand-700 opacity-95 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:52px_52px]"
          />
        )}

        <div className="relative flex h-full flex-col justify-end p-12">
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

          <p className="mt-8 text-[13px] text-faint">
            <Link href="/" className="hover:text-muted hover:underline">← Back to the site</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
