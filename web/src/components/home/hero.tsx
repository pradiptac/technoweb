import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";
import { stripColumns } from "@/lib/strip-columns";
import { ButtonLink } from "@/components/ui/button";
import { IconArrowRight } from "@/components/icons";
import { NocPanel } from "@/components/home/noc-panel";
import { Slider } from "@/components/ui/slider";
import type { Slider as SliderData } from "@/types/api";
import { heroStats } from "@/content/site";
import { statPairs, type SiteSettings } from "@/lib/site-settings";

/**
 * Every string here is settings-driven, with the static values as a fallback.
 *
 * They were hardcoded, which put the invented figures on the must-not-ship
 * list — "340+ sites", "99.9% uptime" — beyond the reach of anyone without a
 * deploy. The fallback keeps the page intact if the settings read fails.
 */
export function Hero({ settings, slider }: { settings: SiteSettings; slider?: SliderData | null }) {
  const stats = statPairs(settings.hero_stats, heroStats);
  const heading = settings.hero_heading ?? "Technology infrastructure that keeps your business connected.";
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-brand-50 to-transparent to-62% pt-12 pb-[72px] max-[479px]:pt-12 lg:pt-20 lg:pb-24">
      {/* faint blueprint grid, faded out toward the bottom */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-85 [background-image:linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_80%_55%_at_50%_0%,#000_20%,transparent_72%)]"
      />
      <Container className="relative">
        <div className="grid items-center gap-12 lg:grid-cols-[1.02fr_.98fr] lg:gap-16 [&>*]:min-w-0">
          <div>
            {/*
              The pill chrome starts at 420px, and the radius is finite.

              Measured: 37px tall from 414px up, 70px at 390 and 360, and 90px
              at 320 — a stadium-shaped container three and four lines tall,
              with the AMC badge orphaned on a line of its own. It had stopped
              looking like a pill some way before it stopped fitting.

              Below 420px it is a plain eyebrow, which is also 36px of hero
              given back at 320px. Above it, `rounded-[20px]`
              rather than `rounded-full`: at one line the box is 40px tall, so
              20px is exactly half of it and the browser renders the same
              stadium — but if the kicker is ever edited to something
              longer, the wrapped result is a tidy rounded rectangle instead of
              a mis-shaped lozenge. The copy is a CMS setting, so it will be.
            */}
            <span className="inline-flex max-w-full flex-wrap items-center gap-2 text-[12.5px] font-medium leading-relaxed text-brand-ink min-[420px]:gap-2.5 min-[420px]:rounded-[20px] min-[420px]:border min-[420px]:border-brand-200 min-[420px]:bg-card min-[420px]:py-1.5 min-[420px]:pr-3.5 min-[420px]:pl-2 min-[420px]:shadow-1">
              <b className="rounded-full bg-brand-600 px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-[.06em] text-white">
                AMC
              </b>
              {settings.hero_kicker ?? "Networking · Servers · Security · Surveillance"}
            </span>

            {/* The last word is brand-coloured. Splitting on the final space
                keeps that working whatever the heading is changed to, rather
                than hardcoding which word gets the accent. */}
            <h1 className="display-1 mt-5.5 max-w-[14ch]">
              {heading.slice(0, heading.trimEnd().lastIndexOf(" "))}{" "}
              <span className="text-brand-ink">
                {heading.trimEnd().slice(heading.trimEnd().lastIndexOf(" ") + 1)}
              </span>
            </h1>

            <p className="lede mt-5 max-w-[52ch]">
              {settings.hero_lede ??
                "We design, deploy and support the networks, servers and security systems your operations run on — engineered properly the first time, then maintained by a support desk that actually answers."}
            </p>

            <div className="mt-8 flex flex-wrap gap-3 max-[479px]:grid max-[479px]:grid-cols-1">
              <ButtonLink href="/contact">
                Talk to an engineer <IconArrowRight />
              </ButtonLink>
              <ButtonLink href="/solutions" variant="secondary">
                Explore solutions
              </ButtonLink>
            </div>

            <dl className={cn("mt-10 grid gap-5 border-t border-line-strong pt-6.5", stripColumns(stats.length, 2))}>
              {stats.map((s) => (
                <div key={s.label}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd>
                    <b className="block font-display text-[23px] font-bold tracking-[-.03em]">{s.value}</b>
                    <span className="text-[13px] text-muted">{s.label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/*
            The carousel when one is configured, the NOC panel when it is not.

            Not a replacement: an install with no slides still gets the panel
            it has always had, so switching this on is an editorial act rather
            than a deploy. `priority` because this is the only slider on the
            site that sits above the fold — everywhere else the first slide
            lazy-loads.
          */}
          {slider && slider.slides?.length ? (
            <Slider
              slider={slider}
              // Wide while it is stacked under the copy, squarer once it has a
              // column of its own: 4/3 across a full-width container is 608px
              // tall at 900px wide, which is most of a tablet screen spent on
              // one picture.
              aspect="aspect-[16/9] lg:aspect-[4/3]"
              priority
              className="shadow-3"
            />
          ) : (
            <NocPanel />
          )}
        </div>
      </Container>
    </section>
  );
}
