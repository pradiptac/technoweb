import Script from "next/script";
import { SectionHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { reviewsEmbed, type SiteSettings } from "@/lib/site-settings";

/**
 * Google reviews on the homepage, through an Elfsight widget.
 *
 * Settings → Embeds holds the snippet Elfsight hands out (a `platform.js`
 * script tag and a `<div class="elfsight-app-…">`), pasted whole — the
 * client's ask (2026-09-17), with drudaysankardas.com as the reference. It
 * is **not** injected as pasted: `reviewsEmbed()` reads the app id and the
 * script address out of it and this component draws the two elements
 * itself, so the only script that runs is one from Elfsight's own CDN and
 * the only markup is the one div — a pasted snippet from anywhere else
 * renders nothing. The script loads `lazyOnload`, after the page is idle,
 * the way the assistant's chunk does: a reviews carousel is never the
 * largest paint. Nothing is drawn without a snippet, so an install that
 * has not set one up shows no empty section.
 *
 * The "Powered by Elfsight" line is hidden by `.reviews-embed` rules in
 * `globals.css`, at the client's request; Elfsight's free plan expects the
 * badge to show, so that is a term for the client to keep or not.
 */
export function Reviews({ settings }: { settings: SiteSettings }) {
  const embed = reviewsEmbed(settings);
  if (!embed) return null;

  return (
    <section className="section-y">
      <Container>
        <SectionHeader
          kicker={settings.reviews_kicker ?? "Reviews"}
          title={settings.reviews_heading ?? "What our customers say"}
          lede={settings.reviews_lede ?? undefined}
        />
        <div className="reviews-embed">
          <div className={embed.appClass} data-elfsight-app-lazy />
        </div>
        <Script src={embed.script} strategy="lazyOnload" />
      </Container>
    </section>
  );
}
