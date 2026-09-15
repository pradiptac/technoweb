import { ArrowLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconCheck } from "@/components/icons";
import { SectionHeader } from "@/components/ui/card";
import { amcInclusions, processSteps, testimonial } from "@/content/site";

// The process diagram, the AMC inclusion list and the web-services grid are
// genuinely static page furniture, not records anyone edits. Everything that
// IS a record — solutions, categories, industries, case studies, posts,
// brands — arrives as props from the CMS, because editing one in the admin
// previously changed every page except this one.

export function WhyUs() {
  return (
    <section className="relative overflow-hidden section-y-lg">
      {/*
        Decorative only — aria-hidden and behind everything. `Container`
        below carries `relative` so it paints after this absolute layer in
        the same positioned stacking bucket; without that it would be a
        static sibling, and CSS paints positioned elements after static
        ones regardless of source order, putting the pattern on top of the
        copy instead of behind it.
      */}
      <div
        aria-hidden
        className="pattern-fade pointer-events-none absolute inset-0 opacity-40 [background-image:url(/patterns/waves-blue.svg)] [background-size:1400px_auto] [background-position:center] [background-repeat:no-repeat]"
      />
      <Container className="relative">
        <div className="grid items-start gap-11 lg:grid-cols-[1.25fr_.75fr] lg:gap-14">
          <div>
            <SectionHeader
              className="mb-7.5"
              kicker="Why Technoware"
              title="Most IT problems are handover problems."
              lede="Someone sells the box, someone else racks it, nobody owns the outcome. We keep all four stages under one roof so there is nobody to point at but us."
            />
            <ol className="grid gap-px overflow-hidden rounded-lg border border-line-strong bg-line">
              {processSteps.map((s) => (
                <li key={s.n} className="grid grid-cols-[auto_1fr] items-start gap-4.5 bg-card p-6 transition-colors hover:bg-brand-50">
                  <span className="grid size-7.5 place-items-center rounded-full border border-brand-200 bg-brand-50 font-mono text-xs font-medium text-brand-ink">
                    {s.n}
                  </span>
                  <div>
                    <h3 className="mb-1.5 text-16-5">{s.title}</h3>
                    <p className="text-14-5 leading-[1.58] text-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid content-start gap-4">
            <figure className="rounded-xl bg-dark p-8 text-dark-ink">
              {/* 600, not 500. This pull-quote was the only element on the whole
                  site rendering Instrument Sans 500, and that weight is a 17KB
                  font file requested on every page. */}
              <blockquote className="font-display text-xl font-semibold leading-[1.42] tracking-[-.02em]">
                “{testimonial.quote}”
              </blockquote>
              <figcaption className="mt-5.5 flex items-center gap-3 border-t border-dark-line pt-5">
                <span className="grid size-9.5 shrink-0 place-items-center rounded-full border border-brand-500 bg-brand-700 font-display text-sm font-semibold text-brand-on">
                  {testimonial.initials}
                </span>
                <span>
                  <b className="block text-sm">{testimonial.name}</b>
                  <span className="text-13 text-dark-muted">{testimonial.role}</span>
                </span>
              </figcaption>
            </figure>

            <div className="rounded-xl border border-line-strong bg-surface p-6.5">
              <h3 className="mb-4 text-15-5">Every AMC contract includes</h3>
              <ul className="mb-4.5 grid gap-2.75">
                {amcInclusions.map((i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm leading-normal text-muted">
                    <IconCheck className="mt-[3px] size-[15px] shrink-0 text-brand-ink" />
                    {i}
                  </li>
                ))}
              </ul>
              <ArrowLink href="/solutions/amc">See what AMC covers</ArrowLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
