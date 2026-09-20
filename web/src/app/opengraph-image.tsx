import { ImageResponse } from "next/og";
import { getSiteSettings } from "@/lib/settings";
import { themeFor } from "@/lib/presets";
import { SITE } from "@/lib/seo";

/**
 * The share preview used by any page without an image of its own.
 *
 * This exists because `buildMetadata` pointed every index page at
 * `/og-default.png`, and that file was never added — so sharing the homepage,
 * the blog or the case studies on LinkedIn or WhatsApp produced a blank
 * preview. Generating it means there is nothing to forget to commit.
 *
 * If `default_og_image` is set in Settings, that wins: a client with real
 * artwork should not be stuck with a generated card.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Technoware — technology infrastructure";

// Revalidated rather than static: the settings it reads can change, and this
// is cheap to regenerate.
export const revalidate = 600;

export default async function OpengraphImage() {
  const settings = await getSiteSettings();
  // The card wears the chosen theme — it used to be olive whatever was picked.
  const c = themeFor(settings).colors;

  // A configured image is served by redirecting the metadata at it instead —
  // handled in buildMetadata. Reaching here means falling back to the card.
  const company = settings.company_name ?? SITE.name;
  const tagline = settings.tagline ?? "Technology infrastructure that keeps your business connected.";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: c.dark,
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, letterSpacing: "-0.03em" }}>
          <span style={{ color: c.darkInk }}>TECHNO</span>
          <span style={{ color: c.brand400 }}>WARE</span>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 44,
            lineHeight: 1.25,
            color: c.darkInk,
            maxWidth: "900px",
            letterSpacing: "-0.02em",
          }}
        >
          {tagline}
        </div>

        <div style={{ display: "flex", fontSize: 26, color: c.darkMuted }}>
          {company} · {SITE.url.replace(/^https?:\/\//, "")}
        </div>
      </div>
    ),
    size,
  );
}
