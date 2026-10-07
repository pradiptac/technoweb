import Image from "next/image";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Illustration } from "@/components/ui/illustrations";
import { Logo } from "@/components/layout/logo";
import { Prose } from "@/components/ui/prose";
import { ADMIN_COOKIE } from "@/lib/admin-cookie";
import { blurProps } from "@/lib/blur";
import { brandName } from "@/lib/brand";
import { lookAttrs, lookFor } from "@/lib/look";
import { noIndex } from "@/lib/no-index";
import { buildMetadata } from "@/lib/seo";
import { getSiteSettings } from "@/lib/settings";
import { settingEnabled, telHref } from "@/lib/site-settings";

export const metadata = buildMetadata({
  title: "Coming soon",
  path: "/coming-soon",
  seo: noIndex,
});

/*
  Rendered per request: it reads a cookie (below), and while the switch is on
  it is every visitor's page — the settings read behind it is the cached one
  the whole site shares, so the request costs a render and no round trip.
*/
export const dynamic = "force-dynamic";

/**
 * The coming-soon page (0.122.0, docs/site-chrome.md).
 *
 * While `coming_soon_enabled` is on, `proxy.ts` rewrites every public page to
 * this route, so a visitor sees it at whatever address they asked for. It
 * sits outside `(marketing)` on purpose: no header, no footer, no assistant,
 * no analytics — a site that is not open yet has nothing to navigate to and
 * nobody to measure.
 *
 * Opened directly with the switch off, it sends a visitor home; a signed-in
 * member of staff is shown it instead, with a line saying nobody else can see
 * it — which is how the wording is checked before the switch is thrown.
 */
export default async function ComingSoonPage() {
  const settings = await getSiteSettings();
  const live = settingEnabled(settings, "coming_soon_enabled", false);

  const staff = (await cookies()).has(ADMIN_COOKIE);
  // Sent here by the proxy, whose copy of the switch can be a minute behind
  // this one. Sending that visitor home would be rewritten straight back.
  const rewritten = (await headers()).get("x-coming-soon") === "1";

  if (!live && !staff && !rewritten) redirect("/");

  const company = settings.company_name ?? brandName();
  const heading = settings.coming_soon_heading?.trim() || "We are getting ready";
  const image = settings.coming_soon_image_url;
  const phone = settings.phone?.trim();
  const email = (settings.sales_email ?? settings.support_email)?.trim();

  return (
    <div className="public-site flex min-h-svh flex-col" {...lookAttrs(lookFor(settings))}>
      {!live && staff && !rewritten && (
        <p className="border-b border-warn/25 bg-warn-soft px-4 py-2 text-center text-13 text-warn">
          Preview — visitors do not see this page until “Show the coming-soon page” is switched on.
        </p>
      )}

      <header className="border-b border-line">
        <Container className="flex h-16 items-center">
          <Logo
            className="text-19"
            logoUrl={settings.logo_url}
            logoWidth={settings.logo_width}
            logoHeight={settings.logo_height}
            companyName={settings.company_name}
          />
        </Container>
      </header>

      <main id="main" className="flex flex-1 items-center">
        <Container className="grid items-center gap-10 py-14 lg:grid-cols-[7fr_5fr] lg:gap-16 lg:py-20">
          <div>
            <p className="text-13 font-semibold tracking-[.08em] text-brand-ink uppercase">Coming soon</p>
            <h1 className="display-1 mt-3">{heading}</h1>
            {settings.coming_soon_message && <Prose html={settings.coming_soon_message} className="mt-5" />}

            {(phone || email) && (
              <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-6 text-15">
                {phone && (
                  <li>
                    <span className="block text-13 text-muted">Call us</span>
                    <a href={telHref(phone)} className="font-mono font-semibold text-ink hover:text-brand-ink">{phone}</a>
                  </li>
                )}
                {email && (
                  <li>
                    <span className="block text-13 text-muted">Write to us</span>
                    <a href={`mailto:${email}`} className="font-semibold text-ink hover:text-brand-ink">{email}</a>
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* The chosen picture, or the "nearly there" drawing: never a blank half. */}
          <div className="order-first lg:order-none">
            {image ? (
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line-strong bg-surface-2">
                <Image
                  src={image}
                  alt=""
                  fill
                  priority
                  sizes="(min-width: 1024px) 40vw, 90vw"
                  className="object-cover"
                  style={settings.coming_soon_image_focus ? { objectPosition: settings.coming_soon_image_focus } : undefined}
                  {...blurProps(settings.coming_soon_image_blur)}
                />
              </div>
            ) : (
              <Illustration name="calendar" className="mx-auto h-auto w-full max-w-[220px] lg:max-w-[340px]" />
            )}
          </div>
        </Container>
      </main>

      <footer className="border-t border-line py-5">
        <Container>
          <p className="text-13 text-muted">© {new Date().getFullYear()} {company}</p>
        </Container>
      </footer>
    </div>
  );
}
