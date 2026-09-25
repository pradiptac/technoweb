import {
  IconFacebook, IconInstagram, IconLinkedin, IconReddit, IconWhatsapp, IconX, IconYoutube,
} from "@/components/icons";
import type { SiteSettings } from "@/lib/site-settings";
import type { CSSProperties } from "react";
import { Dock, DockIcon } from "@/components/velora/dock";

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
  { key: "social_linkedin", label: "LinkedIn", initial: "L", Icon: IconLinkedin, brand: "#0A66C2" },
  { key: "social_x", label: "X", initial: "X", Icon: IconX, brand: "#ffffff" },
  { key: "social_facebook", label: "Facebook", initial: "F", Icon: IconFacebook, brand: "#1877F2" },
  { key: "social_instagram", label: "Instagram", initial: "I", Icon: IconInstagram, brand: "#E4405F" },
  { key: "social_youtube", label: "YouTube", initial: "Y", Icon: IconYoutube, brand: "#FF0000" },
  { key: "social_whatsapp", label: "WhatsApp", initial: "W", Icon: IconWhatsapp, brand: "#25D366" },
  // 5.39:1 on the footer's #12140d, measured 2026-09-24.
  { key: "social_reddit", label: "Reddit", initial: "R", Icon: IconReddit, brand: "#FF4500" },
] as const;

export function SocialLinks({ settings }: { settings: SiteSettings }) {
  const links = PROFILES
    .map((p) => ({ ...p, href: settings[p.key] }))
    .filter((p): p is typeof p & { href: string } => Boolean(p.href));

  if (links.length === 0) return null;

  if (settings.social_style !== "dock") return <SocialFlip links={links} word={settings.social_flip_word} />;

  /*
    Velora's Dock: the tiles magnify under the cursor. This stays a server
    component and hands each `<a>` to the client `DockIcon` as children — the
    same pattern the header uses for identity tiles, so `icons.tsx` never
    crosses the client boundary. The dock's own pill chrome is turned off
    (`bg-transparent`, no border, no blur) because the tiles already carry a
    border each and sit on the footer's dark band; `mx-0` because it is
    left-aligned in the brand column, not centred on a page.
  */
  return (
    <Dock
      baseSize={40}
      magnification={56}
      distance={110}
      className="mx-0 mt-6 h-[60px] gap-2 rounded-none border-0 bg-transparent px-0 pb-0 backdrop-blur-none"
    >
      {links.map(({ key, label, href, Icon, brand }) => (
        <DockIcon key={key} className="rounded-lg bg-transparent text-inherit hover:text-inherit">
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
              "grid size-full place-items-center rounded-lg border border-dark-line text-dark-muted",
              // The mark fills 60% of its tile — 24px at rest, 34px magnified —
              // rather than a fixed 17px, which read as a dot in a box and did
              // not grow with the dock's magnification.
              "transition-colors duration-(--duration-base) [&_svg]:size-[60%]",
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
        </DockIcon>
      ))}
    </Dock>
  );
}

/**
 * Letter tiles that flip to the icons (the client, 2026-09-24, after Vengeance
 * UI's social flip button — MIT, re-drawn rather than vendored: the original
 * pulls in framer-motion and react-icons, and this is a row of six links).
 *
 * The fronts spell `social_flip_word`, and the word decides how many tiles
 * there are, up to `FLIP_MAX` (the client, 2026-09-25: "CONTACT" over six
 * profiles lost its T). A tile past the last profile is a letter and nothing
 * else — not a link, out of the tab order and hidden from a screen reader —
 * whose back repeats the letter, so it never turns over to a blank. A
 * profile past the end of the word shows its network's initial, so a short
 * word still reads as something rather than as blanks. Pointing at the row — or
 * tabbing into it — turns every tile over, one after another, to the icon on
 * the back; the hovered one lifts a name tag above itself.
 *
 * **CSS only, in `globals.css` under `.social-flip`.** The turn is the CSS
 * `rotate` property (`rotate: y 180deg`), transitioned as `rotate` — the
 * Tailwind v4 trap this project keeps meeting: `transition-transform` would
 * animate nothing. The stagger is `--i` on each item. Three cases that are
 * not a flip: a device that cannot hover shows the icons from the start,
 * because letters that only turn into icons under a pointer leave a phone
 * with a word that goes nowhere; reduced motion swaps the faces by opacity;
 * and the link's name is its `aria-label`, so the letter and the tag are
 * both `aria-hidden` and a screen reader hears "Technoware on LinkedIn".
 *
 * The back face is the dock's hover state — the glyph in its brand colour on
 * the footer's dark ground — so every contrast figure measured above still
 * holds for it.
 */
/** The longest word the tiles spell; the API refuses a longer one. */
const FLIP_MAX = 7;

function SocialFlip({ links, word }: {
  links: ((typeof PROFILES)[number] & { href: string })[];
  word: string | undefined;
}) {
  const letters = (word ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, FLIP_MAX);
  const extra = Array.from(letters.slice(links.length));
  const face = "social-flip__face grid place-items-center rounded-lg border border-dark-line font-display text-[17px] font-semibold text-dark-muted";

  return (
    <ul className="social-flip mt-6 flex flex-wrap gap-2">
      {links.map(({ key, label, initial, href, Icon, brand }, i) => (
        <li key={key} style={{ "--i": i, "--brand": brand } as CSSProperties}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Technoware on ${label}`}
            className="social-flip__tile relative block size-10 rounded-lg"
          >
            <span className="social-flip__card relative block size-full">
              <span aria-hidden className={face}>
                {letters[i] ?? initial}
              </span>
              <span
                aria-hidden
                className="social-flip__face social-flip__back grid place-items-center rounded-lg border border-[color-mix(in_srgb,var(--brand)_45%,transparent)] bg-dark text-[var(--brand)] [&_svg]:size-[55%]"
              >
                <Icon />
              </span>
            </span>
            <span
              aria-hidden
              className="social-flip__tip pointer-events-none absolute bottom-full left-1/2 mb-2 rounded-md bg-brand-600 px-2 py-1 text-12 font-semibold whitespace-nowrap text-brand-on"
            >
              {label}
            </span>
          </a>
        </li>
      ))}
      {extra.map((letter, j) => (
        <li
          key={`letter-${j}`}
          aria-hidden
          style={{ "--i": links.length + j, "--brand": "var(--color-dark-muted-brand)" } as CSSProperties}
        >
          <span className="social-flip__tile relative block size-10 rounded-lg">
            <span className="social-flip__card relative block size-full">
              <span className={face}>{letter}</span>
              <span className="social-flip__face social-flip__back grid place-items-center rounded-lg border border-[color-mix(in_srgb,var(--brand)_45%,transparent)] bg-dark font-display text-[17px] font-semibold text-[var(--brand)]">
                {letter}
              </span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
