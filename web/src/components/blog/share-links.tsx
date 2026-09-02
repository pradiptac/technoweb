import { IconFacebook, IconLinkedin, IconWhatsapp, IconX } from "@/components/icons";

/**
 * Share this article.
 *
 * Plain links to each network's own share URL — no SDK, no script, no iframe.
 * A share button that loads a third-party bundle is a tracker on every article
 * page whether or not anybody presses it, which is exactly what the consent
 * banner exists to prevent, and this needs none: every one of these is a URL
 * with two query parameters.
 *
 * **The URL is built here rather than read from `window.location`**, because
 * this is a server component and there is no window — and because the
 * canonical is the address worth sharing anyway. A reader who arrived with
 * `?utm_source=` on the end should not share that at somebody else.
 */
export function ShareLinks({ url, title }: { url: string; title: string }) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);

  const targets = [
    { label: "LinkedIn", Icon: IconLinkedin, href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { label: "X", Icon: IconX, href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
    { label: "Facebook", Icon: IconFacebook, href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    // `wa.me` takes one text field, so the title and the URL travel together.
    { label: "WhatsApp", Icon: IconWhatsapp, href: `https://wa.me/?text=${t}%20${u}` },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[12.5px] font-semibold tracking-[.06em] text-faint uppercase">
        Share
      </span>

      <ul className="flex flex-wrap gap-2">
        {targets.map(({ label, Icon, href }) => (
          <li key={label}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              // The visible content is an icon, so the link needs a name of its
              // own — without it a screen reader announces four links called
              // nothing at all.
              aria-label={`Share on ${label}`}
              className="grid size-10 place-items-center rounded-md border border-line-strong bg-card text-muted transition-colors hover:border-brand-300 hover:text-brand-ink"
            >
              <Icon className="size-4" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
