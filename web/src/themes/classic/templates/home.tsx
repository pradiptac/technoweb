import type { ReactNode } from "react";
import { Hero } from "@/components/home/hero";
import {
  CaseStudies, Credentials, Industries, Partners, ProductCategories,
  Resources, Solutions, SupportBand, TrustedBy, WebServices, WhyUs,
} from "@/components/home/sections";
import { CtaBand } from "@/components/ui/cta-band";
import { SectionBg } from "@/components/ui/section-bg";
import { motionFor } from "@/lib/motion-choices";
import { themeFor } from "@/lib/presets";
import { expand } from "@/lib/themes";
import type { Seeds } from "@/lib/section-background";
import type { HomeData } from "@/themes/contract";
import type { ThemeOptions } from "@/themes/options";

/**
 * Classic's homepage: the hero, eleven sections, the closing band. Moved
 * from `(marketing)/page.tsx` on 2026-09-16 with its notes; the page keeps
 * its metadata and hands the ten fetch results here.
 *
 * The homepage's sections do not reveal on scroll. Every other page keeps
 * the editor's `motion_reveal` choice; here the hero — the slider's own
 * entrance, the stats — is the one orchestrated moment, and the nine
 * sections under it are simply there. A fade-up on each of them was the
 * first thing the UX audit of 2026-09-15 named as reading "generated", on
 * the page people land on first. (`data-aos` stays on inner pages, where
 * the same sections are reached one at a time rather than scrolled
 * through.)
 *
 * Every section sits in a `SectionBg` keyed by its id in `HOME_SECTIONS`,
 * which is nothing at all until the theme options give that section a
 * background — a wrapper with a local palette when they do. The ids are
 * the contract with the Themes screen; a section renamed here is a
 * background an editor set that stops applying.
 */
export function Home({
  settings, solutions, categories, industries, caseStudies, posts, brands, clients, certifications, heroSlider, options,
}: HomeData & { options: ThemeOptions }) {
  const palette = themeFor(settings);
  const companions = expand(palette, "light");
  const bg = { sections: options.sections, seeds: { brand: palette.colors.brand600, secondary: companions.secondary[600], accent: companions.accent[600] } };

  return (
    <>
      <Bg id="hero" {...bg}><Hero settings={settings} slider={heroSlider} /></Bg>
      <Bg id="partners" {...bg}><Partners items={brands.data} /></Bg>
      {/* Six is what the grid was designed around; the index pages list them all. */}
      <Bg id="solutions" {...bg}><Solutions items={solutions.data.slice(0, 6)} /></Bg>
      {/* xl:grid-cols-4 — 12 is three full rows; nine left the last row one short. */}
      <Bg id="categories" {...bg}><ProductCategories items={categories.data.slice(0, 12)} /></Bg>
      <Bg id="why" {...bg}><WhyUs /></Bg>
      <Bg id="clients" {...bg}><TrustedBy items={clients.data} /></Bg>
      <Bg id="credentials" {...bg}><Credentials items={certifications.data} /></Bg>
      <Bg id="industries" {...bg}><Industries items={industries.data.slice(0, 6)} /></Bg>
      <Bg id="web" {...bg}><WebServices /></Bg>
      <Bg id="support" {...bg}><SupportBand /></Bg>
      {/* 2xl:grid-cols-6, matching the product category grid — six is one full row. */}
      <Bg id="cases" {...bg}><CaseStudies items={caseStudies.data.slice(0, 6)} /></Bg>
      <Bg id="resources" {...bg}><Resources items={posts.data.slice(0, 4)} /></Bg>
      <Bg id="cta" {...bg}><CtaBand tone="brand" size="lg" backdrop={motionFor(settings).hero} className="pt-0 pb-19 lg:pb-23" /></Bg>
    </>
  );
}

/** One section's shell, keyed into the options; hoisted so it is not a new component per render. */
function Bg({ id, sections, seeds, children }: { id: string; sections: ThemeOptions["sections"]; seeds: Seeds; children: ReactNode }) {
  return <SectionBg id={id} bg={sections[id]} seeds={seeds}>{children}</SectionBg>;
}
