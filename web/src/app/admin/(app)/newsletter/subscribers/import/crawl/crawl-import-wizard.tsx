"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { DeliveryStatus } from "../../../campaigns/delivery-status";
import { runImportAction } from "../../../actions";
import { Count } from "../count";
import { ImportReview, type ReviewDecision } from "../import-review";
import { discardCrawlAction, pollCrawlAction, startCrawlAction } from "./crawl-actions";
import { formatDate } from "@/lib/dates";
import type { NewsletterCrawlStatus, NewsletterGroup, NewsletterMailboxImport, QueueHealth } from "@/types/api";

/**
 * Import subscribers from a website: source → crawling → review → done
 * (docs/newsletter.md "Crawling a website").
 *
 * The mailbox scan's shape: the crawl is queued work in slices, the screen
 * polls the row every three seconds, and it starts on whatever the API says
 * is the active crawl — a reload mid-crawl lands on the progress panel, one
 * after it on the review. The review is the mailbox scan's own
 * (`ImportReview`), plus the tick that puts everyone in a group named after
 * the industry and a few sample rows, so the reviewer can see a name and a
 * company really were read off the page before committing.
 */

type Step = "source" | "crawling" | "review" | "done";

const DEPTHS = [
  { value: "0", label: "0 — this page only" },
  { value: "1", label: "1 — and the pages it links to" },
  { value: "2", label: "2 — and the pages those link to" },
  { value: "3", label: "3 levels" },
  { value: "4", label: "4 levels" },
];

function stepFor(crawl: NewsletterMailboxImport | null): Step {
  if (!crawl) return "source";
  if (crawl.status === "pending" || crawl.status === "scanning") return "crawling";
  if (crawl.status === "ready") return "review";
  return "source";
}

export function CrawlImportWizard({
  groups, status, queue,
}: {
  groups: NewsletterGroup[];
  status: NewsletterCrawlStatus;
  queue: QueueHealth | null;
}) {
  const [crawl, setCrawl] = useState<NewsletterMailboxImport | null>(status.active);
  const [step, setStep] = useState<Step>(stepFor(status.active));
  const [tally, setTally] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  // Source step.
  const [startUrl, setStartUrl] = useState("");
  const [depth, setDepth] = useState("1");
  const [maxPages, setMaxPages] = useState("150");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [linked, setLinked] = useState(false);
  const [linkedMax, setLinkedMax] = useState("50");
  const [hunter, setHunter] = useState("0");

  // Review step.
  const [industryGroup, setIndustryGroup] = useState(true);

  const hunterLeft = status.hunter && "searches_available" in status.hunter ? status.hunter.searches_available : null;
  const hunterError = status.hunter && "error" in status.hunter ? status.hunter.error : null;
  const analysis = crawl?.analysis ?? null;

  useEffect(() => {
    if (step !== "crawling" || !crawl) return;
    const id = window.setInterval(async () => {
      const fresh = await pollCrawlAction(crawl.id);
      if (!fresh) return;
      setCrawl(fresh);
      if (fresh.status === "ready") setStep("review");
      if (fresh.status === "failed" || fresh.status === "cancelled" || fresh.status === "expired") setStep("source");
    }, 3000);
    return () => window.clearInterval(id);
  }, [step, crawl]);

  const startCrawl = () => {
    setError(null);
    start(async () => {
      const result = await startCrawlAction({
        start_url: startUrl.trim(),
        depth: Number(depth),
        max_pages: Number(maxPages) || 150,
        industry: industry.trim(),
        location: location.trim() || null,
        visit_linked_sites: linked,
        ...(linked ? { linked_sites_max: Number(linkedMax) || 50 } : {}),
        hunter_domains: status.hunter_configured ? Number(hunter) || 0 : 0,
      });
      if (result.error || !result.crawl) {
        setError(result.error ?? "The crawl could not be started.");
        return;
      }
      setCrawl(result.crawl);
      setStep("crawling");
    });
  };

  const discard = () => {
    if (!crawl || !window.confirm("Discard this crawl? Nothing has been imported; the website would have to be read again.")) return;
    start(async () => {
      const result = await discardCrawlAction(crawl.id);
      if (result.error) { setError(result.error); return; }
      setCrawl(null);
      setStep("source");
    });
  };

  const commit = ({ domains, includeRoles, groupIds }: ReviewDecision) => {
    if (!crawl || !analysis) return;
    setError(null);
    start(async () => {
      const result = await runImportAction({
        import_id: crawl.id,
        group_ids: groupIds,
        domains,
        include_roles: includeRoles,
        industry_group: industryGroup,
      });
      if (result.error || !result.tally) {
        setError(result.error ?? "That import could not be completed.");
        return;
      }
      setTally(result.tally);
      setStep("done");
    });
  };

  // ------------------------------------------------------------------ done
  if (step === "done" && tally) {
    return (
      <div>
        <Alert tone="ok" title="Import finished">{tally.imported} added, {tally.updated} updated.</Alert>

        <dl className="mb-4 grid gap-1 rounded-lg border border-line-strong bg-card p-3.5 text-13 sm:max-w-md">
          <Count label="Added" value={tally.imported} />
          <Count label="Already on the list" value={tally.duplicates} />
          <Count label="Updated with new detail" value={tally.updated} />
          <Count label="Left out by the domain and role choices" value={tally.excluded ?? 0} />
          <Count label="Not a valid address" value={tally.invalid} />
          <Count label="Previously unsubscribed" value={tally.suppressed} />
        </dl>

        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/admin/newsletter/subscribers" size="sm">See the subscribers</ButtonLink>
          <Button type="button" size="sm" variant="secondary" onClick={() => { setTally(null); setCrawl(null); setStep("source"); }}>
            Crawl another website
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- review
  if (step === "review" && crawl && analysis) {
    const industryName = analysis.industry ?? crawl.progress?.industry ?? "";

    return (
      <ImportReview
        analysis={analysis}
        groups={groups}
        busy={busy}
        error={error}
        discardLabel="Discard this crawl"
        rolesByDefault
        rolesHint="A business's info@ and sales@ are kept either way; this switch is about noreply@ and its kind."
        onCommit={commit}
        onDiscard={discard}
        intro={<>
          <Alert tone="info" title={`${crawl.filename} — read`} dismissible={false}>
            {(analysis.pages ?? 0).toLocaleString("en-IN")} page{analysis.pages === 1 ? "" : "s"} read
            {(analysis.sites ?? 0) > 0 && <>, {analysis.sites} business site{analysis.sites === 1 ? "" : "s"} opened</>}
            {(analysis.hunter_used ?? 0) > 0 && <>, {analysis.hunter_used} domain{analysis.hunter_used === 1 ? "" : "s"} asked of Hunter</>}
            ; {analysis.counts.total.toLocaleString("en-IN")} addresses found. Everyone imported is tagged
            {industryName && <> <strong>{industryName}</strong></>}
            {analysis.location && <> in <strong>{analysis.location}</strong></>}. The result is kept for a day and then discarded if it is not imported.
          </Alert>
          {analysis.capped && (
            <Alert tone="warn" title="The crawl stopped at its page limit" dismissible={false}>
              There were more pages than the limit allowed. Crawl again with a higher limit, or start from a deeper page.
            </Alert>
          )}
          {(analysis.notes ?? []).length > 0 && (
            <details className="text-12-5 text-muted">
              <summary className="cursor-pointer font-semibold text-ink-2">{analysis.notes!.length} thing{analysis.notes!.length === 1 ? "" : "s"} the crawl could not read</summary>
              <ul className="mt-1.5 grid gap-1 pl-4 [overflow-wrap:anywhere]">
                {analysis.notes!.map((n, i) => <li key={i} className="list-disc">{n}</li>)}
              </ul>
            </details>
          )}
        </>}
      >
        {industryName && (
          <label className="flex items-start gap-2 text-13">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={industryGroup} onChange={(e) => setIndustryGroup(e.target.checked)} />
            <span>
              Also put them in a group called <strong>{industryName}</strong>
              <span className="block text-12-5 text-muted">Made if it does not exist yet, so a campaign can be sent to this industry.</span>
            </span>
          </label>
        )}

        {analysis.preview.length > 0 && (
          <section>
            <h2 className="mb-1.5 text-13 font-semibold">A sample of what was read</h2>
            <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
              <table className="admin-table w-full min-w-[560px] text-13">
                <thead>
                  <tr className="border-b border-line text-left text-11 uppercase tracking-[.05em] text-muted">
                    <th scope="col" className="px-3 py-2">Address</th>
                    <th scope="col" className="px-3 py-2">Name</th>
                    <th scope="col" className="px-3 py-2">Company</th>
                    <th scope="col" className="px-3 py-2">Found on</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.preview.map((row, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td data-label="Address" className="px-3 py-1.5 font-mono text-12-5">{row.email}</td>
                      <td data-label="Name" className="px-3 py-1.5">{[row.first_name, row.last_name].filter(Boolean).join(" ") || "—"}</td>
                      <td data-label="Company" className="px-3 py-1.5">{row.company || "—"}</td>
                      <td data-label="Found on" className="max-w-[32ch] truncate px-3 py-1.5 text-12-5 text-muted" title={row.source_url ?? ""}>{row.source_url || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </ImportReview>
    );
  }

  // -------------------------------------------------------------- crawling
  if (step === "crawling" && crawl) {
    const p = crawl.progress ?? {};
    const limit = p.max_pages ?? 0;
    const pages = p.pages ?? 0;
    const pct = limit > 0 ? Math.min(100, Math.round((pages / limit) * 100)) : null;
    const phase = crawl.status === "pending"
      ? "Waiting for the queue to pick the crawl up…"
      : p.phase === "hunter" ? "Asking Hunter about the domains found…" : "Reading pages…";

    return (
      <div className="grid gap-4">
        {error && <Alert tone="err" title="That did not work">{error}</Alert>}

        <div className="rounded-lg border border-line-strong bg-card p-4">
          <p className="text-13-5 font-semibold text-ink">{phase}</p>
          <p className="mt-0.5 text-12-5 text-muted [overflow-wrap:anywhere]">{p.current ?? crawl.filename}</p>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label="Pages read of the limit">
            <div className="h-full rounded-full bg-brand-600 transition-[width] duration-(--duration-slow)" style={{ width: `${Math.max(pct ?? 0, 5)}%` }} />
          </div>

          <dl className="mt-3 grid gap-x-6 gap-y-1 text-13 sm:grid-cols-2">
            <Count label="Pages read" value={pages} />
            <Count label="Waiting to be read" value={p.queued ?? 0} />
            <Count label="Business sites opened" value={p.sites ?? 0} />
            <Count label="Their pages read" value={p.linked_pages ?? 0} />
            <Count label="Addresses found" value={p.addresses ?? 0} strong />
            <Count label="Hunter lookups" value={p.hunter_used ?? 0} />
            <Count label="Left alone (robots.txt, errors)" value={p.refused ?? 0} />
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Started</dt>
              <dd>{p.started_at ? formatDate(p.started_at, "short") : "—"}</dd>
            </div>
          </dl>

          <p className="mt-3 text-12-5 text-muted">
            A page a second per website, so a large site takes a while: the crawl runs in short slices from the
            queue, and this page follows it. You can leave and come back — it carries on without the page.
          </p>
        </div>

        <div>
          <Button type="button" variant="secondary" size="sm" onClick={discard} disabled={busy}>Discard this crawl</Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- source
  const failed = crawl && (crawl.status === "failed" || crawl.status === "expired");

  return (
    <div className="grid gap-5">
      {failed && crawl.status === "failed" && (
        <Alert tone="err" title="The last crawl did not finish">
          {crawl.error ?? "The website could not be read."} Nothing was imported — start it again.
        </Alert>
      )}
      {failed && crawl.status === "expired" && (
        <Alert tone="warn" title="The last crawl's result was not imported within a day and has been discarded" dismissible={false} />
      )}
      {error && <Alert tone="err" title="That did not work">{error}</Alert>}

      <DeliveryStatus queue={queue} subject="crawl" />

      <fieldset className="grid gap-x-4 sm:grid-cols-2">
        <legend className="mb-3 text-13 font-semibold">Where to start</legend>
        <Field label="Website address" htmlFor="crawl-url" className="sm:col-span-2"
          hint="A directory's member or listing page, or a company's home page. Only pages on this site are followed, unless you ask for the businesses it links to below.">
          <Input id="crawl-url" type="url" inputMode="url" value={startUrl} onChange={(e) => setStartUrl(e.target.value)} placeholder="https://www.example.org/members" autoComplete="off" />
        </Field>
        <Field label="How deep" htmlFor="crawl-depth" variant="float-static">
          <Select id="crawl-depth" value={depth} onChange={(e) => setDepth(e.target.value)}>
            {DEPTHS.filter((d) => Number(d.value) <= status.limits.depth).map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </Field>
        <Field label="At most this many pages" htmlFor="crawl-pages" hint={`Up to ${status.limits.pages}.`}>
          <Input id="crawl-pages" type="number" min={1} max={status.limits.pages} value={maxPages} onChange={(e) => setMaxPages(e.target.value)} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-x-4 sm:grid-cols-2">
        <legend className="mb-3 text-13 font-semibold">Who they are</legend>
        <Field label="Industry" htmlFor="crawl-industry" hint="Recorded on everyone found, and offered as a group of its own at the review.">
          <Input id="crawl-industry" list="crawl-industries" value={industry} onChange={(e) => setIndustry(e.target.value)} maxLength={80} placeholder="Hospitals" autoComplete="off" />
        </Field>
        <datalist id="crawl-industries">
          {status.industries.map((i) => <option key={i} value={i} />)}
        </datalist>
        <Field label="Location (optional)" htmlFor="crawl-location" hint="The city or area, if the site is about one.">
          <Input id="crawl-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={80} placeholder="Kolkata" autoComplete="off" />
        </Field>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-13 font-semibold">Going further</legend>

        <label className="flex items-start gap-2 text-13">
          <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={linked} onChange={(e) => setLinked(e.target.checked)} />
          <span>
            Also open each business&apos;s own website
            <span className="block text-12-5 text-muted">
              For a directory: its home page and up to three pages that look like its contact, about or team page —
              where a business puts its own address. Social networks, marketplaces and search engines are never opened.
            </span>
          </span>
        </label>
        {linked && (
          <div className="pl-6 sm:max-w-[22rem]">
            <Field label="At most this many business sites" htmlFor="crawl-linked" hint={`Up to ${status.limits.linked_sites}.`}>
              <Input id="crawl-linked" type="number" min={1} max={status.limits.linked_sites} value={linkedMax} onChange={(e) => setLinkedMax(e.target.value)} />
            </Field>
          </div>
        )}

        <div className="sm:max-w-[22rem]">
          <Field label="Ask Hunter about this many domains" htmlFor="crawl-hunter"
            hint={!status.hunter_configured
              ? "No Hunter key is saved — add one under System → Settings → API keys to use this."
              : hunterError
                ? `Hunter did not answer: ${hunterError}`
                : `Hunter lists the addresses it knows at a domain, with names and job titles. One search each; ${hunterLeft ?? "—"} left this month. 0 to skip.`}>
            <Input id="crawl-hunter" type="number" min={0} max={status.limits.hunter_domains} value={status.hunter_configured ? hunter : "0"}
              disabled={!status.hunter_configured} onChange={(e) => setHunter(e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button type="button" onClick={startCrawl} pending={busy} disabled={busy || !startUrl.trim() || !industry.trim()}>
          {busy ? "Starting…" : "Crawl website"}
        </Button>
        <p className="measure text-12-5 text-muted">
          Obeys the site&apos;s robots.txt and reads one page a second, and writes nothing until you have reviewed what it found.
        </p>
      </div>
    </div>
  );
}
