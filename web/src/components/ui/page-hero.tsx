import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { JsonLd, jsonLd } from "@/lib/seo";
import { cn } from "@/lib/utils";

export type Crumb = { name: string; path: string };

/**
 * Breadcrumbs render visibly AND as BreadcrumbList structured data — Google
 * uses the markup for the SERP trail, so the two must never drift apart. One
 * component emitting both is the only way to guarantee that.
 */
export function Breadcrumbs({ crumbs, onDark = false }: { crumbs: Crumb[]; onDark?: boolean }) {
  const full = [{ name: "Home", path: "/" }, ...crumbs];

  return (
    <>
      <nav aria-label="Breadcrumb">
        <ol className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]", onDark ? "text-dark-muted" : "text-muted")}>
          {full.map((c, i) => {
            const last = i === full.length - 1;
            return (
              <li key={c.path} className="flex items-center gap-2">
                {last ? (
                  <span aria-current="page" className={onDark ? "text-dark-ink" : "text-ink"}>{c.name}</span>
                ) : (
                  <>
                    <Link href={c.path} className="py-1 hover:underline">{c.name}</Link>
                    <span aria-hidden className="opacity-50">/</span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd data={jsonLd.breadcrumbs(full)} />
    </>
  );
}

export function PageHero({
  kicker, title, lede, crumbs, children, tone = "light",
}: {
  kicker?: string;
  title: string;
  lede?: string | null;
  crumbs?: Crumb[];
  children?: ReactNode;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";

  return (
    <section className={cn("page-hero relative overflow-hidden", dark ? "bg-dark text-dark-ink" : "bg-linear-to-b from-brand-50 to-transparent to-70%")}>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 [background-size:56px_56px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,#000_20%,transparent_75%)]",
          dark
            ? "[background-image:linear-gradient(var(--color-dark-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-dark-line)_1px,transparent_1px)]"
            : "[background-image:linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)]",
        )}
      />
      <Container className="relative pt-11 pb-9 lg:pt-16 lg:pb-10">
        {crumbs && <div className="mb-6"><Breadcrumbs crumbs={crumbs} onDark={dark} /></div>}
        {kicker && (
          <span className={cn("text-[11.5px] font-semibold uppercase tracking-[.13em]", dark ? "text-brand-300" : "text-brand-600")}>
            {kicker}
          </span>
        )}
        <h1 className={cn("display-2 max-w-[20ch]", kicker && "mt-3.5")}>{title}</h1>
        {lede && <p className={cn("lede mt-4 max-w-[62ch]", dark && "text-dark-muted")}>{lede}</p>}
        {children && <div className="mt-7">{children}</div>}
      </Container>
    </section>
  );
}
