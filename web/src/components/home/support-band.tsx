import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconBook, IconTicket } from "@/components/icons";
import { cn } from "@/lib/utils";
import { stripColumns } from "@/lib/strip-columns";
import { supportStats } from "@/content/site";

// The process diagram, the AMC inclusion list and the web-services grid are
// genuinely static page furniture, not records anyone edits. Everything that
// IS a record — solutions, categories, industries, case studies, posts,
// brands — arrives as props from the CMS, because editing one in the admin
// previously changed every page except this one.

const sampleTickets = [
  { id: "#4821", subject: "AP-04 dropping clients in warehouse", label: "In progress", warn: true },
  { id: "#4818", subject: "New user setup — accounts team", label: "Assigned", warn: false },
  { id: "#4802", subject: "Quarterly firewall policy review", label: "Scheduled", warn: false },
  { id: "#4794", subject: "NAS capacity nearing threshold", label: "Pending you", warn: true },
];

export function SupportBand() {
  return (
    <section id="support" className="section-y-lg relative overflow-hidden bg-dark text-dark-ink">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[30%] -right-[8%] size-130 rounded-full bg-[radial-gradient(closest-side,rgba(143,166,94,.22),transparent)]"
      />
      <Container className="relative">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14 [&>*]:min-w-0">
          <div>
            <span className="text-11-5 font-semibold uppercase tracking-[.13em] text-brand-300">Support</span>
            <h2 className="display-2 mt-3.5">A support desk, not a call queue.</h2>
            <p className="lede mt-4 text-dark-muted">
              Every contract customer gets a portal login, full ticket history and a named
              engineer. Raise a ticket, watch it move, see who has it — no chasing, no
              re-explaining the problem to a third person.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/portal/tickets/new" variant="onDark">
                <IconTicket /> Submit a ticket
              </ButtonLink>
              <ButtonLink href="/knowledge-base" variant="onDarkOutline">
                <IconBook /> Knowledge base
              </ButtonLink>
            </div>
            <dl className={cn("mt-7 grid gap-px overflow-hidden rounded-lg border border-dark-line bg-dark-line", stripColumns(supportStats.length, 2))}>
              {supportStats.map((s) => (
                <div key={s.label} className="bg-dark p-5">
                  <dd className="block font-display text-[26px] font-bold tracking-[-.03em]">{s.value}</dd>
                  <dt className="text-12-5 text-dark-muted">{s.label}</dt>
                </div>
              ))}
            </dl>
          </div>

          <div aria-hidden className="overflow-hidden rounded-xl border border-dark-line bg-dark-2">
            <div className="flex items-center gap-2.5 border-b border-dark-line px-4.5 py-3.5 text-13 font-semibold">
              <IconTicket className="size-[15px] text-brand-300" />
              My tickets
              <span className="ml-auto font-mono text-11-5 font-normal text-dark-muted">4 open</span>
            </div>
            {sampleTickets.map((t) => (
              <div key={t.id} className="flex items-center gap-3.5 border-b border-dark-line px-4.5 py-3.5 last:border-b-0">
                <span className="w-[62px] shrink-0 font-mono text-11-5 text-dark-muted">{t.id}</span>
                <span className="min-w-0 truncate text-13-5 text-dark-ink">{t.subject}</span>
                <span className={
                  "ml-auto shrink-0 rounded-full px-2 py-0.5 text-10-5 font-semibold uppercase tracking-[.05em] " +
                  (t.warn ? "bg-dark-warn-fill/15 text-dark-warn" : "bg-brand-400/15 text-brand-300")
                }>
                  {t.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
