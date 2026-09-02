import Link from "next/link";
import { NewsletterSignup } from "@/components/layout/newsletter-signup";
import { YouTubeEmbed } from "@/components/blog/youtube-embed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SiteSettings } from "@/lib/site-settings";
import type { BlogTaxonomy } from "@/types/api";

/**
 * The blog's sidebar.
 *
 * One component rather than six files, because these are six small widgets
 * that only ever appear together and always in this order — search, then what
 * to read, then how to keep hearing from us. Splitting them would be six
 * imports to say the same thing.
 *
 * Sticky from `lg` up: at that width the article column is far taller than the
 * sidebar, so a static one leaves a column of dead space beside three screens
 * of posts. Below `lg` it falls under the list, where a sticky panel would eat
 * a phone's viewport.
 *
 * **The link colours carry no alpha.** `text-brand-ink/85` looked like a
 * gentler version of the same colour and measured **1.22:1** in dark across
 * every row of both lists: `brand-ink` inverts to a light sage there, and an
 * alpha on an inverting token composites to something neither the designer nor
 * the checker can predict. Solid token, and the hover moves to a different
 * token rather than to a different opacity.
 */
export function BlogSidebar({
  taxonomy, settings, query, activeCategory,
}: {
  taxonomy: BlogTaxonomy | null;
  settings: SiteSettings;
  query?: string;
  activeCategory?: string;
}) {
  const video = settings.blog_video_url;

  return (
    <aside className="grid gap-4 lg:sticky lg:top-24 lg:self-start">
      <Panel>
        {/*
          A plain GET form, so a search is shareable, indexable and works with
          no JavaScript — the rule the knowledge base already follows. The
          label is visually hidden rather than absent: an input labelled only
          by a heading two elements away is announced as "edit text, blank".
        */}
        <form action="/blog" className="flex gap-2">
          <label htmlFor="blog-search" className="sr-only">Search the blog</label>
          <Input
            id="blog-search"
            name="q"
            type="search"
            defaultValue={query ?? ""}
            placeholder="Search…"
            className="min-w-0 flex-1"
          />
          <Button type="submit" size="sm" className="shrink-0">Search</Button>
        </form>
      </Panel>

      {taxonomy && taxonomy.categories.length > 0 && (
        <Panel heading="Categories">
          <ul className="grid gap-2.5">
            {taxonomy.categories.map((category) => {
              const active = category.slug === activeCategory;

              return (
                <li key={category.id}>
                  <Link
                    href={`/blog/category/${category.slug}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-baseline justify-between gap-2 text-[13.5px] transition-colors",
                      active ? "font-semibold text-brand-ink" : "text-brand-ink hover:text-brand-700",
                    )}
                  >
                    <span className="min-w-0">{category.name}</span>
                    {/*
                      The count is muted and not part of the link's name: a
                      screen reader announcing "Artificial Intelligence 18"
                      reads as an article title. It is information for the eye.
                    */}
                    <span aria-hidden className="shrink-0 tabular-nums text-faint">
                      ({category.posts_count ?? 0})
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {taxonomy && taxonomy.archive.length > 0 && (
        <Panel heading="Archive">
          <ul className="grid gap-2.5">
            {taxonomy.archive.map((month) => (
              <li key={`${month.year}-${month.month}`}>
                <Link
                  href={`/blog?year=${month.year}&month=${month.month}`}
                  className="flex items-baseline justify-between gap-2 text-[13.5px] text-brand-ink transition-colors hover:text-brand-700"
                >
                  <span>{month.label}</span>
                  <span aria-hidden className="shrink-0 tabular-nums text-faint">({month.total})</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel heading="Subscribe">
        <p className="mb-3 text-[13.5px] leading-[1.55] text-muted">
          The occasional field note from the engineers doing the work. No product
          announcements.
        </p>
        {/*
          The real signup, not a copy of it. It posts to the subscribe endpoint,
          honours the suppression list and answers identically for every address
          so the form cannot be used to test who is on the list.
        */}
        <NewsletterSignup />
      </Panel>

      {video && (
        <Panel heading="Watch">
          <YouTubeEmbed url={video} />
        </Panel>
      )}

      <FollowUs settings={settings} />
    </aside>
  );
}

function Panel({ heading, children }: { heading?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line-strong bg-card p-5">
      {heading && (
        <h2 className="mb-4 text-[15px] font-semibold after:mt-2.5 after:block after:h-[3px] after:w-9 after:rounded-full after:bg-brand-600">
          {heading}
        </h2>
      )}
      {children}
    </section>
  );
}

/**
 * The social row, as full-width buttons rather than the footer's icon strip.
 *
 * Same settings, same order, different presentation — and the order is fixed
 * in `social-links.tsx` rather than repeated here, because two lists of the
 * same six keys is exactly the drift nothing type-checks.
 *
 * Brand colours are used here and deliberately not in the footer: there the
 * marks sit in a row on near-black and six brand colours read as a sticker
 * album. Here each is a wide button with its own label, which is what the
 * colour is doing work for. Every one is white text on the brand's own hex,
 * which is the pairing those colours were designed for.
 */
function FollowUs({ settings }: { settings: SiteSettings }) {
  const links = SOCIAL_BUTTONS
    .map((s) => ({ ...s, href: settings[s.key] }))
    .filter((s): s is typeof s & { href: string } => Boolean(s.href));

  if (links.length === 0) return null;

  return (
    <Panel heading="Follow us">
      <ul className="grid gap-2">
        {links.map(({ key, label, href, className }) => (
          <li key={key}>
            <a
              href={href}
              // They leave the site, so they open away from it and do not hand
              // the opener a window handle back.
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-2.5 rounded px-3.5 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90",
                className,
              )}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/*
 * The brand colours, as arbitrary values rather than tokens on purpose: these
 * are *other companies'* colours, not this site's, so they must not move when
 * the theme does.
 *
 * **Every one is computed against white, not quoted from a brand guide.** The
 * first cut of this comment claimed 4.5:1 for Facebook and WhatsApp and both
 * were wrong — the published `#1877F2` is **4.23:1** and `#128C7E` is
 * **4.14:1**. Two colours darkened until they cleared the line, and the
 * numbers below came out of a calculator.
 *
 *   LinkedIn  #0A66C2   5.69:1     X         #0f1419  18.51:1
 *   Facebook  #0C63D6   5.57:1     YouTube   #C4302B   5.52:1
 *   Instagram #C13584   5.11:1     WhatsApp  #075E54   7.67:1
 *
 * WhatsApp's published green (#25D366) is 1.9:1 under white; its own dark
 * teal is used instead. Facebook's is darkened a step, which is the smallest
 * change that passes and still reads as Facebook blue.
 *
 * **Only three of these are set on this install**, so the audit measured three
 * and Facebook's failure would have shipped and surfaced the day somebody
 * filled that setting in — the contrast check only ever measures what is on
 * the page. Add a colour here and compute it; do not trust the brand guide.
 */
const SOCIAL_BUTTONS = [
  { key: "social_linkedin", label: "LinkedIn", className: "bg-[#0A66C2]" },
  { key: "social_facebook", label: "Facebook", className: "bg-[#0C63D6]" },
  { key: "social_instagram", label: "Instagram", className: "bg-[#C13584]" },
  { key: "social_x", label: "X", className: "bg-[#0f1419]" },
  { key: "social_youtube", label: "YouTube", className: "bg-[#C4302B]" },
  { key: "social_whatsapp", label: "WhatsApp", className: "bg-[#075E54]" },
] as const;
