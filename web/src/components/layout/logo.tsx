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
  companyName = "",
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

          A little larger on a phone (2026-09-21, the client's ask): 31px tall
          under `sm` against 28 above it, where the bar is taller and the mark
          sits beside a full navigation. The width cap moves 120 → 128, which
          is still inside the 130px the flanking group leaves at 320px.

          **Bigger again on a phone (2026-09-23), and the cap is what moves.**
          Raising the height alone does nothing for the mark this client
          uploaded: it is a wide wordmark, so `max-w` binds first and a taller
          box just leaves more empty space above and below a 128px-wide image.
          The room is a real number and it is not the same at every phone
          width — the flanking group (the consultation button and the menu
          toggle) is a fixed 150px of `shrink-0`, and the container is 90%, so
          what is left for the logo is 130px at 320, 174px at 360 and 201px at
          390. The cap now follows that: 128px below 360, 164px from 360 and
          190px from 390, each inside its own budget with room for the gap. The
          height ceiling goes to 36px so a square or stacked mark can use the
          extra width too, and the console — whose bar is 52px — is unaffected,
          because a 36px box only fills when the mark is tall rather than wide.
        */
        className={cn(
          "h-[36px] w-auto max-w-[128px] object-contain min-[360px]:max-w-[164px] min-[390px]:max-w-[190px] sm:h-[28px] sm:max-w-none",
          className,
        )}
        priority
      />
    );
  }

  /*
    The text wordmark is the company's own name, never a literal: the product is
    sold under each customer's name, and it drew "TECHNOWARE" on every install
    that had not uploaded a logo yet (2026-09-28). The last word takes the brand
    ink when there is more than one, which is the two-tone the old literal had.

    A name is as long as the customer's name is, so it gets the image's width
    caps and truncates past them — a header row that fits 320px with a 190px
    mark does not fit it with "Sunrise Enterprise Solutions Pvt Ltd".
  */
  const words = companyName.trim().split(/\s+/).filter(Boolean);
  const last = words.length > 1 ? words.pop() : undefined;
  const head = words.join(" ");

  return (
    <span
      title={companyName}
      className={cn(
        "inline-block max-w-[128px] truncate align-middle font-display text-[25px] font-bold leading-[1.15] tracking-[-.045em] min-[360px]:max-w-[164px] min-[390px]:max-w-[190px] sm:max-w-[260px] sm:text-[23px]",
        className,
      )}
    >
      <span className={onDark ? "text-white" : "text-ink"}>{head}</span>
      {last && <span className={onDark ? "text-brand-400" : "text-brand-ink"}> {last}</span>}
    </span>
  );
}
