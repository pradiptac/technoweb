import { ArrowLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconCheck } from "@/components/icons";
import { SectionHeader } from "@/components/ui/card";
import { amcInclusions, processSteps, testimonial as staticTestimonial } from "@/content/site";
import { linePairs, lines, settingEnabled, type SiteSettings } from "@/lib/site-settings";

/**
 * The "Why Technoware" block: the argument, the numbered steps, a pull-quote
 * and the AMC card.
 *
 * Read from Settings → Homepage since 2026-09-21 — `why_*`, the three
 * `testimonial_*` rows (seeded and labelled long before anything read them)
 * and `amc_*` — where until then every word was a constant in
 * `content/site.ts` and the client asked how the block could be edited. The
 * constants stay as the fallback for a row the seeder has not created, the
 * hero's rule, so an install that has not re-seeded renders what it did.
 *
 * The testimonial and the AMC card are hidden by their own switches
 * (`testimonial_enabled`, `amc_enabled`) and never by a blank field. The
 * public `/settings` map drops a blank value, so the site cannot tell
 * "cleared" from "never set" — a blank is a fallback like every other row,
 * and a switch is the one thing the wire format can carry (the promo band's
 * rule). Both off, the steps take the full width rather than sitting
 * beside an empty column. Switching the whole section off is the Themes
 * screen's job.
 *
 * The steps are numbered by position (`01`…), never by a stored number; the
 * initials on the disc come from the author's name.
 */
export function WhyUs({ settings = {} }: { settings?: SiteSettings }) {
  const kicker = settings.why_kicker ?? "Why Technoware";
  const heading = settings.why_heading ?? "Most IT problems are handover problems.";
  const lede = settings.why_lede
    ?? "Someone sells the box, someone else racks it, nobody owns the outcome. We keep all four stages under one roof so there is nobody to point at but us.";

  const steps = settings.why_steps ? linePairs(settings.why_steps) : processSteps.map((s) => ({ title: s.title, body: s.body }));

  const quote = settings.testimonial_quote ?? staticTestimonial.quote;
  const author = settings.testimonial_author ?? staticTestimonial.name;
  const role = settings.testimonial_role ?? staticTestimonial.role;
  const showQuote = settingEnabled(settings, "testimonial_enabled", true) && Boolean(quote);

  const amcHeading = settings.amc_heading ?? "Every AMC contract includes";
  const inclusions = settings.amc_inclusions === undefined ? [...amcInclusions] : lines(settings.amc_inclusions);
  const amcLabel = settings.amc_link_label ?? "See what AMC covers";
  const amcHref = settings.amc_link_href ?? "/solutions/amc";
  const showAmc = settingEnabled(settings, "amc_enabled", true) && inclusions.length > 0;

  const aside = showQuote || showAmc;

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
        <div className={aside ? "grid items-start gap-11 lg:grid-cols-[1.25fr_.75fr] lg:gap-14" : "grid gap-11"}>
          <div>
            <SectionHeader className="mb-7.5" kicker={kicker} title={heading} lede={lede} />
            {steps.length > 0 && (
              <ol className="grid gap-px overflow-hidden rounded-lg border border-line-strong bg-line">
                {steps.map((s, i) => (
                  <li key={`${i}-${s.title}`} className="grid grid-cols-[auto_1fr] items-start gap-4.5 bg-card p-6 transition-colors hover:bg-brand-50">
                    <span className="grid size-7.5 place-items-center rounded-full border border-brand-200 bg-brand-50 font-mono text-xs font-medium text-brand-ink">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="mb-1.5 text-16-5">{s.title}</h3>
                      <p className="text-14-5 leading-[1.58] text-muted">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {aside && (
            <div className="grid content-start gap-4">
              {showQuote && (
                <figure className="rounded-xl bg-dark p-8 text-dark-ink">
                  {/* 600, not 500. This pull-quote was the only element on the whole
                      site rendering Instrument Sans 500, and that weight is a 17KB
                      font file requested on every page. */}
                  <blockquote className="font-display text-xl font-semibold leading-[1.42] tracking-[-.02em]">
                    “{quote}”
                  </blockquote>
                  <figcaption className="mt-5.5 flex items-center gap-3 border-t border-dark-line pt-5">
                    <span className="grid size-9.5 shrink-0 place-items-center rounded-full border border-brand-500 bg-brand-700 font-display text-sm font-semibold text-brand-on">
                      {initials(author)}
                    </span>
                    <span>
                      <b className="block text-sm">{author}</b>
                      {role && <span className="text-13 text-dark-muted">{role}</span>}
                    </span>
                  </figcaption>
                </figure>
              )}

              {showAmc && (
                <div className="rounded-xl border border-line-strong bg-card p-6.5">
                  <h3 className="mb-4 text-15-5">{amcHeading}</h3>
                  <ul className="mb-4.5 grid gap-2.75">
                    {inclusions.map((i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm leading-normal text-muted">
                        <IconCheck className="mt-[3px] size-[15px] shrink-0 text-brand-ink" />
                        {i}
                      </li>
                    ))}
                  </ul>
                  {amcLabel && <ArrowLink href={amcHref}>{amcLabel}</ArrowLink>}
                </div>
              )}
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}

/** "R. Kulkarni" → "RK": the first letter of each of the first two words, dots dropped. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}
