import { Hero } from "@/components/home/hero";
import {
  CaseStudies, Credentials, Industries, Partners, ProductCategories,
  Resources, Solutions, SupportBand, TrustedBy, WebServices, WhyUs,
} from "@/components/home/sections";
import { CtaBand } from "@/components/ui/cta-band";
import { motionFor } from "@/lib/motion-choices";
import type { HomeData } from "@/themes/contract";

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
 */
export function Home({
  settings, solutions, categories, industries, caseStudies, posts, brands, clients, certifications, heroSlider,
}: HomeData) {
  return (
    <>
      <Hero settings={settings} slider={heroSlider} />
      <Partners items={brands.data} />
      {/* Six is what the grid was designed around; the index pages list them all. */}
      <Solutions items={solutions.data.slice(0, 6)} />
      {/* xl:grid-cols-4 — 12 is three full rows; nine left the last row one short. */}
      <ProductCategories items={categories.data.slice(0, 12)} />
      <WhyUs />
      <TrustedBy items={clients.data} />
      <Credentials items={certifications.data} />
      <Industries items={industries.data.slice(0, 6)} />
      <WebServices />
      <SupportBand />
      {/* 2xl:grid-cols-6, matching the product category grid — six is one full row. */}
      <CaseStudies items={caseStudies.data.slice(0, 6)} />
      <Resources items={posts.data.slice(0, 4)} />
      <CtaBand tone="brand" size="lg" backdrop={motionFor(settings).hero} className="pt-0 pb-19 lg:pb-23" />
    </>
  );
}
