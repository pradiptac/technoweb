import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";
import type { PageHeroProps } from "@/themes/contract";

/**
 * Editorial's heading block: a headline, not a banner.
 *
 * No photograph and no wash — the section banner a page names is ignored
 * here, because a paper's section front opens on type, not on a picture
 * behind type. The trail sits on the top rule in small capitals, the kicker
 * is a short rule and a label, the headline is the display serif at a
 * width that lets a long name breathe (no cap — the classic hero's reason),
 * and the lede is set in the body face one size up. A `dark` tone keeps
 * the same shape on the dark ground.
 */
export function PageHero({ kicker, title, lede, crumbs, children, tone = "light" }: PageHeroProps) {
  const dark = tone === "dark";

  return (
    <section className={cn("page-hero border-b border-line-strong", dark ? "bg-dark text-dark-ink" : "bg-page")}>
      <Container className="pt-6 pb-10 lg:pt-8 lg:pb-14">
        {crumbs && (
          <div className={cn("mb-8 border-t pt-3 text-11 uppercase tracking-[.12em]", dark ? "border-dark-line" : "border-line-strong")}>
            <Breadcrumbs crumbs={crumbs} onDark={dark} />
          </div>
        )}
        {kicker && (
          <span className={cn("flex items-center gap-3 text-11-5 font-semibold uppercase tracking-[.16em]", dark ? "text-brand-300" : "text-brand-ink")}>
            <span aria-hidden className="h-px w-8 bg-current" />
            {kicker}
          </span>
        )}
        <h1 className={cn("display-1 max-w-[22ch] text-balance font-normal tracking-[-.01em]", kicker && "mt-4")}>{title}</h1>
        {lede && (
          <p className={cn("mt-5 text-[19px] leading-[1.5]", dark ? "text-dark-muted" : "text-ink-2")}>
            {lede}
          </p>
        )}
        {children && <div className="mt-7">{children}</div>}
      </Container>
    </section>
  );
}
