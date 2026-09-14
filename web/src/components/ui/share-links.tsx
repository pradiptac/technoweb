import {
  IconFacebook, IconLinkedin, IconMail, IconTelegram, IconWhatsapp, IconX,
} from "@/components/icons";
import { CopyLink } from "@/components/ui/copy-link";
import { cn } from "@/lib/utils";

/**
 * Share this page — an article, a product.
 *
 * Plain links to each network's own share URL — no SDK, no script, no iframe.
 * A share button that loads a third-party bundle is a tracker on every page
 * whether or not anybody presses it, which is exactly what the consent banner
 * exists to prevent, and this needs none: every one of these is a URL with two
 * query parameters. The one control that is not a URL, "copy link", is the
 * one client component, and it is small.
 *
 * **The URL is built by the caller rather than read from `window.location`**,
 * because this is a server component and there is no window — and because the
 * canonical is the address worth sharing anyway. A reader who arrived with
 * `?utm_source=` on the end should not share that at somebody else.
 *
 * The targets are the ones this audience actually uses to pass a link to a
 * colleague — WhatsApp and email first among them for a purchase decision,
 * LinkedIn and X for an article. One list rather than two, so the blog and
 * the shop cannot drift into offering different networks.
 */
export function ShareLinks({
  url, title, label = "Share", className,
}: {
  url: string;
  title: string;
  label?: string;
  className?: string;
}) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);

  const targets = [
    // `wa.me` takes one text field, so the title and the URL travel together.
    { label: "WhatsApp", Icon: IconWhatsapp, href: `https://wa.me/?text=${t}%20${u}` },
    { label: "LinkedIn", Icon: IconLinkedin, href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { label: "X", Icon: IconX, href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
    { label: "Facebook", Icon: IconFacebook, href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { label: "Telegram", Icon: IconTelegram, href: `https://t.me/share/url?url=${u}&text=${t}` },
    // A `mailto:` opens whatever the person already writes email in; the
    // body carries the link on its own line under the title.
    { label: "email", Icon: IconMail, href: `mailto:?subject=${t}&body=${t}%0A${u}` },
  ];

  const control = "grid size-10 place-items-center rounded-md border border-line-strong bg-card text-muted transition-colors hover:border-brand-300 hover:text-brand-ink";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="mr-1 text-12-5 font-semibold tracking-[.06em] text-faint uppercase">
        {label}
      </span>

      <ul className="flex flex-wrap gap-2">
        {targets.map(({ label, Icon, href }) => (
          <li key={label}>
            <a
              href={href}
              // A `mailto:` opened in a new tab is a blank tab beside the mail
              // client; only the web targets get one.
              target={href.startsWith("mailto:") ? undefined : "_blank"}
              rel="noopener noreferrer"
              // The visible content is an icon, so the link needs a name of its
              // own — without it a screen reader announces six links called
              // nothing at all.
              aria-label={label === "email" ? "Share by email" : `Share on ${label}`}
              title={label === "email" ? "Share by email" : `Share on ${label}`}
              className={control}
            >
              <Icon className="size-4" aria-hidden />
            </a>
          </li>
        ))}
        <li>
          <CopyLink url={url} className={control} />
        </li>
      </ul>
    </div>
  );
}
