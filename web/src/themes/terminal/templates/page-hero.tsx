import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";
import type { PageHeroProps } from "@/themes/contract";

/**
 * Terminal's heading block: a prompt.
 *
 * The trail in the mono face, then `$ cat <kicker>` as the command, the
 * title as a `#` heading in the display face, the lede as a quoted line,
 * a hairline under the lot. On the page's own ground in both schemes; the
 * section banner a page names is not drawn, and `tone` is accepted for
 * the contract's sake and changes nothing. The heading has no width cap,
 * the rule every hero follows.
 */
export function PageHero({ kicker, title, lede, crumbs, children }: PageHeroProps) {
  return (
    <section className="page-hero border-b border-line-strong bg-surface">
      <Container className="pt-8 pb-9 lg:pt-10 lg:pb-11">
        {crumbs && (
          <div className="mb-5 font-mono text-12-5">
            <Breadcrumbs crumbs={crumbs} />
          </div>
        )}
        <p className="font-mono text-13 text-muted">
          <span className="text-brand-ink">$</span> cat {(kicker ?? title).toLowerCase().replace(/\s+/g, "-")}
        </p>
        <h1 className={cn("display-2 mt-3 text-balance")}>
          <span aria-hidden className="mr-3 text-brand-ink">#</span>{title}
        </h1>
        {lede && <p className="lede measure mt-4"><span aria-hidden className="font-mono text-faint">{"> "}</span>{lede}</p>}
        {children && <div className="mt-7">{children}</div>}
      </Container>
    </section>
  );
}
