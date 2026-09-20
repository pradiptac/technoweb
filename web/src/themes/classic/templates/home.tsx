import { Hero } from "@/components/home/hero";
import {
  CaseStudies, Credentials, Industries, Partners, ProductCategories,
  Resources, Solutions, SupportBand, TrustedBy, WebServices, WhyUs,
} from "@/components/home/sections";
import { Reviews } from "@/components/home/reviews";
import { CtaBand } from "@/components/ui/cta-band";
import { HomeSection as Bg, homeSeeds } from "@/components/ui/section-bg";
import { motionFor } from "@/lib/motion-choices";
import type { HomeData } from "@/themes/contract";
import { orderSections, type ThemeOptions } from "@/themes/options";

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
 * Every section is one entry of `SECTIONS`, keyed by its id in
 * `HOME_SECTIONS`: `orderSections()` draws them in the order the theme
 * options ask for and leaves out the ones switched off, and each sits in a
 * `HomeSection` shell that is nothing at all until the options give it a
 * background. The ids are the contract with the Themes screen; a section
 * renamed here is a setting an editor made that stops applying.
 */
export function Home({
  settings, solutions, categories, industries, caseStudies, posts, brands, clients, certifications, heroSlider, options,
}: HomeData & { options: ThemeOptions }) {
  const bg = { sections: options.sections, seeds: homeSeeds(settings) };
  const SECTIONS = [
    { id: "hero", node: <Hero settings={settings} slider={heroSlider} /> },
    { id: "partners", node: <Partners items={brands.data} /> },
    // Six is what the grid was designed around; the index pages list them all.
    { id: "solutions", node: <Solutions items={solutions.data.slice(0, 6)} /> },
    // xl:grid-cols-4 — 12 is three full rows; nine left the last row one short.
    { id: "categories", node: <ProductCategories items={categories.data.slice(0, 12)} /> },
    { id: "why", node: <WhyUs /> },
    { id: "clients", node: <TrustedBy items={clients.data} /> },
    { id: "credentials", node: <Credentials items={certifications.data} /> },
    { id: "reviews", node: <Reviews settings={settings} /> },
    { id: "industries", node: <Industries items={industries.data.slice(0, 6)} /> },
    { id: "web", node: <WebServices /> },
    { id: "support", node: <SupportBand settings={settings} /> },
    // 2xl:grid-cols-6, matching the product category grid — six is one full row.
    { id: "cases", node: <CaseStudies items={caseStudies.data.slice(0, 6)} /> },
    { id: "resources", node: <Resources items={posts.data.slice(0, 4)} /> },
    { id: "cta", node: <CtaBand tone="brand" size="lg" backdrop={motionFor(settings).hero} className="pt-0 pb-19 lg:pb-23" /> },
  ];

  return (
    <>
      {orderSections(SECTIONS, options).map((s) => (
        <Bg key={s.id} id={s.id} {...bg}>{s.node}</Bg>
      ))}
    </>
  );
}

