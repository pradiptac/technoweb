import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { SectionHeader } from "@/components/ui/card";
import type { BlogPost } from "@/types/api";

export function Resources({ items }: { items: BlogPost[] }) {
  return (
    <section data-aos="fade-up" id="resources" className="relative overflow-hidden border-y border-line bg-surface section-y-lg">
      {/* Decorative only — see the note on `.pattern-fade` in globals.css. */}
      <div
        aria-hidden
        className="pattern-fade pointer-events-none absolute inset-0 opacity-50 [background-image:url(/patterns/circle-fade.svg)] [background-size:700px_700px] [background-position:center] [background-repeat:no-repeat]"
      />
      <Container className="relative">
        <SectionHeader
          kicker="Resources"
          title="Written by the engineers on the job."
          lede="Field notes, configuration guides and knowledge-base articles — the same material our support desk uses."
        />
        <div className="grid gap-3.5 lg:grid-cols-2">
          {items.map((p) => {
            const published = p.published_at ? new Date(p.published_at) : null;
            return (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="flex gap-4.5 rounded-lg border border-line-strong bg-card p-5 transition-colors duration-(--duration-base) hover:border-brand-300 hover:bg-brand-50"
              >
                <div className="grid shrink-0 place-content-center rounded-lg bg-brand-50 px-3.5 py-2 text-center font-mono">
                  <b className="block text-19 text-brand-ink">{published ? published.getDate() : "—"}</b>
                  <span className="text-11 uppercase tracking-[.04em] text-brand-ink">
                    {published ? published.toLocaleString("en-GB", { month: "short" }) : ""}
                  </span>
                </div>
                <div>
                  <h3 className="mb-1.25 text-base">{p.title}</h3>
                  <p className="text-13-5 leading-normal text-muted">{p.excerpt}</p>
                  <div className="mt-2.25 text-xs text-muted">
                    {p.reading_minutes ? `${p.reading_minutes} min read` : ""}
                    {p.author?.name ? ` · ${p.author.name}` : ""}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-6.5">
          <ButtonLink href="/resources" variant="secondary">
            All resources <IconArrowRight />
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
