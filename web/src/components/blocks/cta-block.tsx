import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Backdrop } from "@/components/ui/backdrop";
import { IconArrowRight, IdentityIcon } from "@/components/icons";
import { IconCheck } from "@/components/icons-ui";
import { publicApi } from "@/lib/api";
import { getSiteSettings } from "@/lib/settings";
import { settingEnabled, telHref } from "@/lib/site-settings";
import { focalStyle } from "@/lib/focal";
import { blurProps } from "@/lib/blur";
import { formatDate } from "@/lib/dates";
import { contact } from "@/content/site";
import { cn } from "@/lib/utils";
import { ThemeBand } from "@/components/ui/theme-band";
import type { ContentBlock, CtaContent } from "@/types/api";
import { CtaForm } from "./cta-form";
import { CtaCountdown } from "./cta-countdown";

type CtaBlockData = Extract<ContentBlock, { type: "cta" }>;

/**
 * A CTA banner — `SliderLayout`'s shape for calls to action (the client,
 * 2026-09-24, layouts from vibeprompts.dev/cta).
 *
 * `band` is drawn **by the active theme** (`ThemeBand`), with the block's
 * words and buttons, so a band placed by shortcode looks like the band at
 * the foot of every page. Every other layout is drawn here, on the same
 * dark brand panel the classic band uses: `bg-brand-900` stays dark in both
 * schemes, so white words on it are graded once (`brand-900` is one of the
 * pairs the theme gate checks). Forms sit on a `bg-card` panel inside it, so
 * the fields keep the ordinary form colours.
 *
 * `override` is the nine pages that bring their own heading ("Thinking
 * about firewalls?") — they keep it when the site default is not a band.
 */
export async function CtaBlock({ block, embedded = false, override, className }: {
  block: CtaBlockData;
  embedded?: boolean;
  override?: { heading?: string; body?: string };
  className?: string;
}) {
  const c: CtaContent = {
    ...block.content,
    heading: override?.heading ?? block.content.heading,
    body: override?.body ?? block.content.body,
  };

  if (block.layout === "band") {
    return (
      <ThemeBand
        title={c.heading}
        body={c.body ?? undefined}
        kicker={c.kicker ?? undefined}
        primary={c.primary ?? undefined}
        secondary={secondaryFor(c)}
        className={cn(embedded && "py-0 my-10", className)}
      />
    );
  }

  const settings = await getSiteSettings();
  if (block.layout === "newsletter" && !settingEnabled(settings, "newsletter_signup_enabled", true)) return null;
  const phone = settings.phone ?? contact.phone;

  const body = await layoutBody(block, c, phone);
  if (!body) return null;

  const panel = (
    <div data-aos="fade-up" className="relative overflow-hidden rounded-xl bg-brand-900 px-6 py-10 text-white sm:px-10 sm:py-12">
      <Backdrop variant="grid" tone="brand" size={48} mask="radial-gradient(ellipse 60% 80% at 50% 0%, #000, transparent 70%)" />
      <div className="relative">{body}</div>
    </div>
  );

  if (embedded) return <div className={cn("my-10", className)}>{panel}</div>;
  return (
    <section className={cn("section-y", className)}>
      <Container>{panel}</Container>
    </section>
  );
}

/** `call` (or unset) → the theme's own "Call {phone}"; `none` → no second button; `link` → the link. */
function secondaryFor(c: CtaContent): { label: string; href: string } | null | undefined {
  if (c.secondary_mode === "none") return null;
  if (c.secondary_mode === "link" && c.secondary?.label && c.secondary?.href) return { label: c.secondary.label, href: c.secondary.href };
  return undefined;
}

function Words({ c, align = "center" }: { c: CtaContent; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "text-center" : ""}>
      {c.kicker && <p className="mb-3 text-12 font-semibold uppercase tracking-[.14em] text-dark-muted-brand">{c.kicker}</p>}
      <h2 className="display-3 text-balance text-white">{c.heading}</h2>
      {c.body && <p className={cn("mt-4 max-w-[56ch] text-dark-muted-brand", align === "center" && "mx-auto")}>{c.body}</p>}
    </div>
  );
}

function Buttons({ c, phone, align = "center" }: { c: CtaContent; phone: string; align?: "center" | "left" }) {
  const second = secondaryFor(c);
  // No number on file makes the default "Call" button no button at all.
  const noSecond = second === null || (second === undefined && !phone);
  if (!c.primary?.href && noSecond) return null;
  return (
    <div className={cn("mt-7 flex flex-wrap gap-3", align === "center" && "justify-center")}>
      {c.primary?.href && (
        <ButtonLink href={c.primary.href} variant="onDark">
          {c.primary.label || "Get in touch"} <IconArrowRight />
        </ButtonLink>
      )}
      {second === undefined ? (
        phone ? <ButtonLink href={telHref(phone)} variant="onDarkOutline" className="border-white/25 text-white">Call {phone}</ButtonLink> : null
      ) : second ? (
        <ButtonLink href={second.href} variant="onDarkOutline" className="border-white/25 text-white">{second.label}</ButtonLink>
      ) : null}
    </div>
  );
}

async function layoutBody(block: CtaBlockData, c: CtaContent, phone: string) {
  switch (block.layout) {
    case "split":
      return (
        <div className={cn("grid items-center gap-8 lg:grid-cols-2", c.image_side === "left" && "lg:[&>*:first-child]:order-2")}>
          <div>
            <Words c={c} align="left" />
            <Buttons c={c} phone={phone} align="left" />
          </div>
          {c.image && (
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-dark">
              <Image src={c.image} alt={c.image_alt ?? ""} fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" style={focalStyle(c.image_focus)} {...blurProps(c.image_blur)} />
            </div>
          )}
        </div>
      );

    case "two_path":
      return (
        <>
          <Words c={c} />
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {(c.paths ?? []).map((path) => (
              <li key={path.title} className="flex flex-col rounded-lg bg-card p-6 text-ink">
                {path.icon && <IdentityIcon name={path.icon} className="mb-3 size-8" />}
                <h3 className="text-17 font-semibold">{path.title}</h3>
                {path.body && <p className="mt-2 flex-1 text-14 text-muted">{path.body}</p>}
                {path.cta?.href && (
                  <ButtonLink href={path.cta.href} className="mt-5 self-start">
                    {path.cta.label || "Continue"} <IconArrowRight />
                  </ButtonLink>
                )}
              </li>
            ))}
          </ul>
        </>
      );

    case "reassurance":
      return (
        <>
          <Words c={c} />
          <Buttons c={c} phone={phone} />
          <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-14 text-dark-muted-brand">
            {(c.promises ?? []).map((promise) => (
              <li key={promise} className="inline-flex items-center gap-2">
                <IconCheck aria-hidden className="size-4 text-white" /> {promise}
              </li>
            ))}
          </ul>
        </>
      );

    case "newsletter":
    case "gated_download":
    case "webinar": {
      const when = block.layout === "webinar" && c.starts_at ? new Date(c.starts_at) : null;
      return (
        <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <Words c={c} align="left" />
            {when && (
              <ul className="mt-5 grid gap-1.5 text-14 text-dark-muted-brand">
                <li><strong className="text-white">When:</strong> {formatDate(when.toISOString(), "long")}{" · "}
                  {when.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST
                  {c.duration_minutes ? ` · ${c.duration_minutes} minutes` : ""}</li>
                {c.where && <li><strong className="text-white">Where:</strong> {c.where}</li>}
              </ul>
            )}
          </div>
          <CtaForm slug={block.slug} kind={block.layout} placeholder={c.placeholder} buttonLabel={c.button_label} />
        </div>
      );
    }

    case "countdown":
      if (!c.ends_at) return null;
      if (new Date(c.ends_at).getTime() <= Date.now() && (c.expired ?? "hide") === "hide") return null;
      return (
        <CtaCountdown endsAt={c.ends_at} expired={c.expired ?? "hide"} expiredMessage={c.expired_message}>
          <Words c={c} />
          <Buttons c={c} phone={phone} />
        </CtaCountdown>
      );

    case "hiring": {
      const jobs = await publicApi.careers().then((r) => r.data).catch(() => []);
      const shown = jobs.slice(0, c.limit ?? 3);
      return (
        <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <Words c={c} align="left" />
            <Buttons c={{ ...c, secondary_mode: "none" }} phone={phone} align="left" />
          </div>
          {shown.length > 0 ? (
            <ul className="grid gap-2">
              {shown.map((job) => (
                <li key={job.slug}>
                  <Link href={`/careers/${job.slug}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg bg-card px-5 py-4 text-ink transition-colors duration-(--duration-base) hover:bg-surface-2">
                    <span className="font-semibold">{job.title}</span>
                    <span className="text-13 text-muted">{[job.department, job.location || "Remote", job.employment_type_label].filter(Boolean).join(" · ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-card px-5 py-4 text-14 text-muted">No roles open right now — the careers page lists them when there are.</p>
          )}
        </div>
      );
    }

    case "app_qr":
      return (
        <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <Words c={c} align="left" />
            {/* Store buttons on a phone, where there is no second screen to scan from. */}
            <div className="mt-6 flex flex-wrap gap-3 md:hidden">
              {c.ios_url && <ButtonLink href={c.ios_url} variant="onDark">App Store</ButtonLink>}
              {c.android_url && <ButtonLink href={c.android_url} variant="onDark">Google Play</ButtonLink>}
              {!c.ios_url && !c.android_url && c.url && <ButtonLink href={c.url} variant="onDark">Get the app</ButtonLink>}
            </div>
          </div>
          {c.qr && (
            <div className="hidden rounded-lg bg-card p-4 text-center text-ink md:block">
              <Image src={c.qr} alt="QR code for the app" width={160} height={160} className="size-40" />
              <p className="mt-2 text-12 text-muted">Scan with your phone</p>
            </div>
          )}
        </div>
      );

    default:
      return (
        <>
          <Words c={c} />
          <Buttons c={c} phone={phone} />
        </>
      );
  }
}
