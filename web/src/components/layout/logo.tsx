import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The site wordmark.
 *
 * Renders an uploaded logo when one is set in Settings, and falls back to the
 * text treatment otherwise. The fallback is not a placeholder to be removed —
 * it is what a site with no logo file should look like, and it keeps the
 * header intact if the image 404s after a media file is deleted.
 *
 * `logoUrl` is passed down rather than read here, because this renders inside
 * the header and footer on every page and a settings read per instance would
 * be a fetch the layout has already done.
 */
export function Logo({
  className, onDark = false, logoUrl, logoWidth, logoHeight,
  companyName = "Technoware",
}: {
  className?: string;
  onDark?: boolean;
  logoUrl?: string | null;
  logoWidth?: string | null;
  logoHeight?: string | null;
  companyName?: string;
}) {
  if (logoUrl) {
    /*
      The file's own dimensions, sent by the API beside the URL.

      These decide the box the browser holds open before the image arrives, so
      getting them wrong is a visible layout shift rather than a detail. The
      declared 180x40 was a guess, and the client's mark is 600x81 — so the box
      was 126px wide until the image loaded and 207px afterwards, and the whole
      navigation beside it jumped right on every cold load. The final position
      was correct, which is exactly what makes it read as a rendering fault
      rather than as a wrong number.

      The fallback is kept for a path with no media row behind it. It is the
      same guess and the same shift; what it is not is a crash, and it is the
      only case where nothing better is knowable.
    */
    const w = Number(logoWidth) || 180;
    const h = Number(logoHeight) || 40;

    return (
      <Image
        src={logoUrl}
        alt={companyName}
        width={w}
        height={h}
        /*
          The uploaded file decides its own aspect ratio, so **both** axes are
          capped. A height cap alone reads as sufficient and bounds nothing
          horizontally, which is how this shipped broken.

          Height is 28px rather than 34. The console's bar is 52px, so 34
          filled two thirds of it and the mark read as the subject of the
          header rather than as its label; the public header is 68px and
          carries either comfortably, so this is sized for the tighter of the
          two. At 28 a typical wide mark comes out around 208px.

          208px is still too wide for a phone. In the console it pushed Sign
          out off the screen at 360px, and at 320px it ran 61px past the public
          header, whose flanking group — the consultation CTA and the menu
          button — is a fixed 150px of `shrink-0` that will not yield. That
          leaves 130px, hence a 120px cap below `sm`, released above it.

          Neither audit had ever caught it, because no logo was configured when
          those runs went through: the text fallback below is far narrower, so
          the bug arrived with the client's first upload rather than with any
          commit. `object-contain` is what makes the cap scale the whole mark
          down rather than crop it.
        */
        className={cn("h-[28px] w-auto max-w-[120px] object-contain sm:max-w-none", className)}
        priority
        unoptimized
      />
    );
  }

  return (
    <span className={cn("font-display text-[23px] font-bold leading-none tracking-[-.045em]", className)}>
      <span className={onDark ? "text-white" : "text-ink"}>TECHNO</span>
      <span className={onDark ? "text-brand-400" : "text-brand-ink"}>WARE</span>
    </span>
  );
}
