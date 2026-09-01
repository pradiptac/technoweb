import {
  IconFacebook, IconInstagram, IconLinkedin, IconWhatsapp, IconX, IconYoutube,
} from "@/components/icons";
import type { SiteSettings } from "@/lib/site-settings";
import type { CSSProperties } from "react";

/**
 * Social profile links, driven by Settings in the admin.
 *
 * Order is fixed here rather than by the editor: it is a visual decision, not
 * a content one, and LinkedIn leads because that is where a B2B infrastructure
 * business is actually found.
 *
 * A blank setting renders nothing at all — an icon linking to a profile that
 * does not exist is worse than no icon. If none are set the whole row is
 * omitted, so the footer never shows an empty strip.
 */
/**
 * The mark, and the colour it belongs to.
 *
 * Resting they are all the footer's muted grey, because six brand colours in a
 * row is a sticker album rather than a footer — and none of them is the *site's*
 * colour, so at rest they would be six things competing with the one thing this
 * page is actually about. On hover each takes its own, which is the moment the
 * reader has asked which one they are pointing at.
 *
 * **Every value is checked against the footer's own background**, `--color-dark`
 * (#12140d), rather than pasted from a brand guide and hoped for: WCAG 1.4.11
 * wants 3:1 for a graphic that carries meaning. LinkedIn is the tightest at
 * 3.26, and the rest run from 4.38 to 18.56. If a mark is added, measure it —
 * a brand colour designed for white can be invisible on near-black.
 *
 * **X is white, and that is its brand colour here.** Its mark is black on a
 * light surface and white on a dark one; painting the official black on this
 * footer would hide it completely.
 */
const PROFILES = [
  { key: "social_linkedin", label: "LinkedIn", Icon: IconLinkedin, brand: "#0A66C2" },
  { key: "social_x", label: "X", Icon: IconX, brand: "#ffffff" },
  { key: "social_facebook", label: "Facebook", Icon: IconFacebook, brand: "#1877F2" },
  { key: "social_instagram", label: "Instagram", Icon: IconInstagram, brand: "#E4405F" },
  { key: "social_youtube", label: "YouTube", Icon: IconYoutube, brand: "#FF0000" },
  { key: "social_whatsapp", label: "WhatsApp", Icon: IconWhatsapp, brand: "#25D366" },
] as const;

export function SocialLinks({ settings }: { settings: SiteSettings }) {
  const links = PROFILES
    .map((p) => ({ ...p, href: settings[p.key] }))
    .filter((p): p is typeof p & { href: string } => Boolean(p.href));

  if (links.length === 0) return null;

  return (
    <ul className="mt-6 flex flex-wrap gap-2">
      {links.map(({ key, label, href, Icon, brand }) => (
        <li key={key}>
          <a
            href={href}
            // These leave the site, so they open away from it and do not hand
            // the opener a window handle back.
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Technoware on ${label}`}
            /*
              The colour rides in on a custom property so one class list serves
              all six — the alternative is a hover class per brand, which is six
              strings Tailwind has to be told about and six places to edit.
            */
            style={{ "--brand": brand } as CSSProperties}
            className={[
              "grid size-10 place-items-center rounded-lg border border-dark-line text-dark-muted",
              "transition-colors duration-200 [&_svg]:size-[17px]",
              // Focus as well as hover: a keyboard user asks the same question
              // by arriving on it, and answering only a mouse is answering half
              // the people who use this.
              "hover:text-[var(--brand)] focus-visible:text-[var(--brand)]",
              // The border takes the same colour at low alpha, so the tile
              // agrees with the mark inside it rather than staying grey around
              // a coloured glyph.
              "hover:border-[color-mix(in_srgb,var(--brand)_45%,transparent)]",
              "focus-visible:border-[color-mix(in_srgb,var(--brand)_45%,transparent)]",
            ].join(" ")}
          >
            <Icon />
          </a>
        </li>
      ))}
    </ul>
  );
}
