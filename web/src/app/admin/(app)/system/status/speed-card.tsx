import { StatTile } from "@/components/admin/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { IconDatabase, IconGlobe, IconServer } from "@/components/icons";
import { byImpact, speedSummaryLine } from "@/lib/speed";
import type { SpeedCheck, SpeedImpact, SpeedReport, SpeedState } from "@/types/system";
import { Command } from "./scheduler-guide";

/**
 * System → Status, "Speed": what on this install slows the site down, how
 * much it matters, and exactly how to fix it (docs/distribution.md "Speed
 * suggestions").
 *
 * Every row is the API's own finding (`SpeedChecks`) or one of the two only
 * the website can answer (`lib/speed.ts`); nothing here decides anything. The
 * order is the owner's: what needs doing first and matters most, then what
 * could not be looked at, and the rest one fold away — a page of green rows
 * answers a question nobody asked. A snippet is `Command` from the scheduler
 * card (a scroll box of its own, `w-0 min-w-full`, and the copy control), so
 * a long line scrolls inside its row and the card stays the width of a phone.
 */
export function SpeedCard({ report }: { report: SpeedReport }) {
  const sorted = byImpact(report.checks);
  const pick = (state: SpeedState) => sorted.filter((c) => c.state === state);
  const attention = pick("attention");
  const unknown = pick("unknown");
  const good = pick("good");
  const info = pick("info");
  const { boot_ms: boot, db_ms: db, website_ms: web } = report.measured;

  return (
    <Card interactive={false} padding="sm" as="section" className="min-w-0 lg:col-span-2" id="speed-card">
      {/* The anchor the command palette opens ("slow", "opcache", "cache"). */}
      <h2 id="speed" className="scroll-mt-24 text-15 font-semibold">Speed</h2>
      <p className="mt-1 text-13-5" data-speed-summary>
        <span className="font-semibold">{speedSummaryLine(report.summary)}</span>
        <span className="text-muted">. Checked just now, on this server.</span>
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3" data-speed-measured>
        <StatTile compact tone="neutral" icon={IconServer} label="PHP got to this page in"
          value={boot === null ? "—" : `${boot} ms`} note={boot === null ? "This server did not say." : "Includes starting the application."} />
        <StatTile compact tone="neutral" icon={IconDatabase} label="A database question takes"
          value={db === null ? "—" : `${db} ms`} note={db === null ? "Could not be timed." : "Under 5 ms is ideal."} />
        <StatTile compact tone="neutral" icon={IconGlobe} label="The website answered in"
          value={web === null ? "—" : `${web} ms`} note={web === null ? "It did not answer." : "Asked from this server."} />
      </div>

      <div className="mt-5 grid gap-5">
        <Section title="Needs attention" count={attention.length} empty="Nothing is slowing the site down that this page can see.">
          {attention.map((c) => <Row key={c.key} check={c} />)}
        </Section>

        {unknown.length > 0 && (
          <Section title="Could not check" count={unknown.length}>
            {unknown.map((c) => <Row key={c.key} check={c} />)}
          </Section>
        )}

        {good.length > 0 && (
          <details className="rounded-md border border-line bg-surface px-3 py-2" data-speed-good>
            <summary className="cursor-pointer text-13 font-semibold text-brand-ink">Good — {good.length} {good.length === 1 ? "check" : "checks"}</summary>
            <ul className="mt-3 grid gap-3">{good.map((c) => <Row key={c.key} check={c} />)}</ul>
          </details>
        )}

        {info.length > 0 && (
          <Section title="For information" count={info.length}>
            {info.map((c) => <Row key={c.key} check={c} />)}
          </Section>
        )}
      </div>
    </Card>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-13-5 font-semibold">{title} <span className="font-normal text-muted">({count})</span></h3>
      {count === 0 ? <p className="text-13 text-ok">{empty}</p> : <ul className="grid gap-3">{children}</ul>}
    </div>
  );
}

const STATE: Record<SpeedState, { tone: "resolved" | "urgent" | "progress" | "closed"; label: string }> = {
  good: { tone: "resolved", label: "Good" },
  attention: { tone: "urgent", label: "Needs attention" },
  unknown: { tone: "progress", label: "Could not check" },
  info: { tone: "closed", label: "For information" },
};

const IMPACT: Record<SpeedImpact, string> = { high: "High impact", medium: "Medium impact", low: "Low impact" };

function Row({ check }: { check: SpeedCheck }) {
  const state = STATE[check.state];

  return (
    <li className="min-w-0 rounded-md border border-line bg-surface p-3" data-speed-check={check.key} data-state={check.state}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Badge tone={state.tone}>{state.label}</Badge>
        <h4 className="min-w-0 text-13-5 font-semibold [overflow-wrap:anywhere]">{check.label}</h4>
        <span className="ml-auto text-12 text-muted">{IMPACT[check.impact]}</span>
      </div>
      <p className="mt-2 text-13-5 [overflow-wrap:anywhere]">{check.detail}</p>
      {check.fix && (
        <p className="mt-1.5 text-13-5 text-ink-2 [overflow-wrap:anywhere]" data-speed-fix>
          <strong className="font-semibold">What to do: </strong>{check.fix}
        </p>
      )}
      {check.snippet && <div className="mt-2" data-speed-snippet><Command text={check.snippet} /></div>}
    </li>
  );
}
