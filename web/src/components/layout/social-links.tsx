import {
  IconFacebook, IconInstagram, IconLinkedin, IconWhatsapp, IconX, IconYoutube,
} from "@/components/icons";
import type { SiteSettings } from "@/lib/site-settings";

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
const PROFILES = [
  { key: "social_linkedin", label: "LinkedIn", Icon: IconLinkedin },
  { key: "social_x", label: "X", Icon: IconX },
  { key: "social_facebook", label: "Facebook", Icon: IconFacebook },
  { key: "social_instagram", label: "Instagram", Icon: IconInstagram },
  { key: "social_youtube", label: "YouTube", Icon: IconYoutube },
  { key: "social_whatsapp", label: "WhatsApp", Icon: IconWhatsapp },
] as const;

export function SocialLinks({ settings }: { settings: SiteSettings }) {
  const links = PROFILES
    .map((p) => ({ ...p, href: settings[p.key] }))
    .filter((p): p is typeof p & { href: string } => Boolean(p.href));

  if (links.length === 0) return null;

  return (
    <ul className="mt-6 flex flex-wrap gap-2">
      {links.map(({ key, label, href, Icon }) => (
        <li key={key}>
          <a
            href={href}
            // These leave the site, so they open away from it and do not hand
            // the opener a window handle back.
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Technoware on ${label}`}
            className="grid size-10 place-items-center rounded-lg border border-dark-line text-dark-muted transition-colors duration-200 hover:border-dark-muted hover:text-white [&_svg]:size-[17px]"
          >
            <Icon />
          </a>
        </li>
      ))}
    </ul>
  );
}
