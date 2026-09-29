import {
  IconFacebook, IconInstagram, IconLinkedin, IconReddit, IconWhatsapp, IconX, IconYoutube,
} from "@/components/icons";
import type { SiteSettings } from "@/lib/site-settings";
import type { CSSProperties, ReactElement } from "react";
import { IconMail } from "@/components/icons-ui";
import { contact } from "@/content/site";
import { brandName } from "@/lib/brand";
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

  const company = settings.company_name ?? brandName();

  if (settings.social_style !== "dock") {
    // Email follows the profiles as a tile of its own, as it does in the
    // source component — the address the header and the footer plates use.
    const email = settings.support_email ?? contact.email;
    const flip: FlipLink[] = [
      ...links.map(({ key, label, initial, href, Icon, brand }) => ({ key, label, initial, href, Icon, brand, external: true })),
      ...(email ? [{ key: "email", label: "Email", initial: "E", href: `mailto:${email}`, Icon: IconMail, brand: "var(--color-dark-ink)", external: false }] : []),
    ];
    return <SocialFlip links={flip} word={settings.social_flip_word} company={company} />;
  }

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
            aria-label={`${company} on ${label}`}
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
 * Letter tiles that flip to the icons — Vengeance UI's social flip button
 * (the client, 2026-09-24; re-drawn to its source on 2026-09-26 after "not
 * followed properly"). MIT, re-drawn rather than vendored: the original pulls
 * in framer-motion and react-icons for a row of seven links.
 *
 * What is taken from the source, part for part:
 * - **The panel**: the tiles sit in a rounded panel with a hairline border
 *   and two light streaks running along its top and bottom edges, in
 *   opposite directions, forever — the component's signature.
 * - **The faces**: the front is a filled tile with the letter in bold; the
 *   back is the footer's dark with the mark in its **own brand colour** (the
 *   client, 2026-09-26 — the source is monochrome; the colours are the ones
 *   measured against `--color-dark` in `PROFILES`, and a near-white back
 *   would have hidden X's white mark).
 * - **One line, always** (the client, 2026-09-26): the tiles are a one-row
 *   grid that shrinks them to the column — 40px at most, ~26px in the
 *   narrowest footer column (the brand column at 1024px), never under the
 *   24px target, which is why the panel's padding and gaps are tight — and the letters
 *   scale with the tile through container units, never under 12px. The
 *   panel's width is worked out from the tile count so a short row does not
 *   sit in a wide empty box.
 * - **The turn**: a spring (stiffness 120, damping 15 — about 5% overshoot)
 *   staggered 80ms per tile, as `--ease-spring`.
 * - **The name tag**: a pill with an arrow that rises and grows above the
 *   tile under the pointer.
 * - **Email is a tile**, after the profiles: the source's "CONTACT" is six
 *   networks and an envelope, and so is this site's with six profiles set.
 *
 * The fronts spell `social_flip_word` (up to `FLIP_MAX`); a letter past the
 * last tile gets a tile of its own that is not a link — `aria-hidden`, out of
 * the tab order — whose back repeats the letter, so it never turns to a
 * blank. A link past the end of the word shows its network's initial.
 *
 * **CSS only, in `globals.css` under `.social-flip`.** The turn is the CSS
 * `rotate` property, never a transform utility (the v4 trap). A device that
 * cannot hover shows the icons from the start; reduced motion swaps the faces
 * by opacity and stops the streaks; the link's name is its `aria-label`, so a
 * screen reader hears "Technoware on LinkedIn".
 *
 * The panel carries its own ground — the dark lifted by a few per cent of
 * the footer's ink — so it reads as a surface on the dark footers and on the
 * light ones alike, and every colour inside it is a non-inverting dark token.
 */
/** The longest word the tiles spell; the API refuses a longer one. */
const FLIP_MAX = 7;

type FlipLink = { key: string; label: string; initial: string; href: string; Icon: (p: { className?: string }) => ReactElement; brand: string; external: boolean };

function SocialFlip({ links, word, company }: { links: FlipLink[]; word: string | undefined; company: string }) {
  const letters = (word ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, FLIP_MAX);
  const extra = Array.from(letters.slice(links.length));
  const count = links.length + extra.length;
  const tile = "social-flip__tile relative block aspect-square w-full rounded-lg [container-type:inline-size]";
  const front = "social-flip__face grid place-items-center rounded-lg bg-dark-line font-display text-[max(12px,42cqi)] font-bold text-dark-ink shadow-1";
  const back = "social-flip__face social-flip__back grid place-items-center rounded-lg border border-[color-mix(in_srgb,var(--brand)_45%,transparent)] bg-dark text-[var(--brand)]";

  return (
    <div
      style={{ "--n": count } as CSSProperties}
      className="social-flip relative mt-6 w-full max-w-[calc(var(--n)*2.5rem+(var(--n)-1)*0.25rem+1rem)] rounded-2xl border border-dark-line bg-[color-mix(in_srgb,var(--color-dark-ink)_5%,var(--color-dark))] p-2"
    >
      {/* The streaks, clipped to the panel's corners and kept off every pointer. */}
      <span aria-hidden className="pointer-events-none absolute -inset-px overflow-hidden rounded-2xl">
        <span className="social-flip__streak absolute top-0 left-0 h-px w-full bg-linear-to-r from-transparent via-dark-ink/50 to-transparent" />
        <span className="social-flip__streak social-flip__streak--back absolute bottom-0 left-0 h-px w-full bg-linear-to-r from-transparent via-dark-ink/50 to-transparent" />
      </span>
      <ul className="relative grid grid-flow-col auto-cols-fr gap-1">
        {links.map(({ key, label, initial, href, Icon, brand, external }, i) => (
          <li key={key} className="min-w-0" style={{ "--i": i, "--brand": brand } as CSSProperties}>
            <a
              href={href}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              aria-label={external ? `${company} on ${label}` : `Email ${company}`}
              className={tile}
            >
              <span className="social-flip__card relative block size-full">
                <span aria-hidden className={front}>
                  {letters[i] ?? initial}
                </span>
                <span aria-hidden className={`${back} [&_svg]:size-[50%]`}>
                  <Icon />
                </span>
              </span>
              <span
                aria-hidden
                className="social-flip__tip pointer-events-none absolute bottom-full left-1/2 z-10 mb-3 rounded-lg bg-dark-ink px-3 py-1.5 text-12 font-semibold whitespace-nowrap text-dark shadow-3"
              >
                {label}
                <span className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-dark-ink" />
              </span>
            </a>
          </li>
        ))}
        {extra.map((letter, j) => (
          <li key={`letter-${j}`} aria-hidden className="min-w-0" style={{ "--i": links.length + j, "--brand": "var(--color-dark-muted-brand)" } as CSSProperties}>
            <span className={tile}>
              <span className="social-flip__card relative block size-full">
                <span className={front}>{letter}</span>
                <span className={`${back} font-display text-[max(12px,42cqi)] font-bold`}>{letter}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
