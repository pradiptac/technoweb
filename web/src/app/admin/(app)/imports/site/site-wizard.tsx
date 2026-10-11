"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Field, FileInput, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { BrandPanel } from "./brand-panel";
import { DeliveryStatus } from "../../newsletter/campaigns/delivery-status";
import { Count } from "../../newsletter/subscribers/import/count";
import { Progress, Radio, StepsTable } from "../wordpress/wordpress-wizard";
import { formatDate } from "@/lib/dates";
import { uploadInChunks } from "@/lib/chunk-upload";
import {
  commitSiteImportAction, discardSiteImportAction, pollSiteImportAction, saveSiteDecisionsAction, startSiteImportAction,
  type SiteImportActionResult,
} from "./actions";
import type {
  QueueHealth, SiteImport, SiteImportDecisions, SiteImportKind, SiteImportSection, SiteImportSource,
} from "@/types/api";

/**
 * Import a website: connect → reading → review → importing → done.
 *
 * `wordpress-wizard.tsx`'s shape, for the same reasons: everything after
 * "connect" is queued work, so the screen polls the import row every three
 * seconds and starts on whatever the API reports as the import in hand — a
 * page reloaded mid-scan lands back on the progress panel and one reloaded
 * after it on the review. The review is the point of the screen: nothing is
 * written until somebody has read what will come across, what will not and
 * why, and changing a choice there re-runs the dry run, so the counts shown
 * are always the counts the commit will produce.
 */

type Step = "connect" | "reading" | "review" | "importing" | "done";

const WORKING = ["pending", "scanning", "analysing", "running"];

/** Rows of the page table shown at a time; the rest are a press away. */
const PAGE_ROWS = 100;

const SECTIONS: { value: Exclude<SiteImportSection, "pages">; label: string; hint: string }[] = [
  { value: "menus", label: "Menus", hint: "The header's and the footer's links, as menus you can assign yourself." },
  { value: "redirects", label: "Redirects", hint: "A 301 from each page's old address to its new one, so links and rankings carry over." },
];

function stepFor(item: SiteImport | null): Step {
  if (!item) return "connect";
  if (["pending", "scanning", "analysing"].includes(item.status)) return "reading";
  if (item.status === "ready") return "review";
  if (item.status === "running") return "importing";
  if (item.status === "completed") return "done";
  if (item.status === "failed" && item.can_resume) return "importing";
  return "connect";
}

const n = (value: number) => value.toLocaleString("en-IN");

const PHASES: Record<string, string> = {
  crawl: "Reading pages", zip: "Unpacking the ZIP", chrome: "Telling the site's header and footer from its content", done: "Finishing",
};

/** What a page may become, if the API did not say. */
const KIND_FALLBACK: { value: SiteImportKind; label: string }[] = [
  { value: "page", label: "Page" }, { value: "post", label: "Blog post" }, { value: "product", label: "Catalogue product" }, { value: "skip", label: "Leave out" },
];

/** The kinds already chosen, 0.163.0's list of pages left out included. */
function storedKinds(item: SiteImport): Record<string, SiteImportKind> {
  return {
    ...Object.fromEntries((item.decisions?.skip ?? []).map((path) => [path, "skip" as SiteImportKind])),
    ...(item.decisions?.kinds ?? {}),
  };
}

/** A section type as a person reads it. */
function typeLabel(type: string, count: number): string {
  const label = type.replace(/_/g, " ");
  return count > 1 ? `${count} × ${label}` : label;
}

export function SiteImportWizard({
  active, history, queue, limits, chunkBytes,
}: {
  active: SiteImport | null;
  history: SiteImport[];
  queue: QueueHealth | null;
  limits: { depth: number; pages: number; zip_bytes: number };
  chunkBytes: number;
}) {
  const [item, setItem] = useState<SiteImport | null>(active);
  const [step, setStep] = useState<Step>(stepFor(active));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, start] = useTransition();

  // Connect.
  const [source, setSource] = useState<SiteImportSource>("url");
  const [address, setAddress] = useState("");
  const [depth, setDepth] = useState("3");
  const [maxPages, setMaxPages] = useState("300");
  const [sections, setSections] = useState<SiteImportSection[]>(["pages", "menus", "redirects"]);
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);

  // Review choices, seeded from the analysis each time the review opens.
  const [decisions, setDecisions] = useState<SiteImportDecisions>({});
  const [filter, setFilter] = useState("");
  const [shown, setShown] = useState(PAGE_ROWS);

  useEffect(() => {
    if (!item || !WORKING.includes(item.status)) return;
    const id = window.setInterval(async () => {
      const fresh = await pollSiteImportAction(item.id);
      if (!fresh) return;
      setItem(fresh);
      const next = stepFor(fresh);
      if (next !== step) {
        if (next === "review") setDecisions({});
        if (fresh.status === "failed" && !fresh.can_resume) setError(fresh.error);
        setStep(next);
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [item, step]);

  const act = (work: () => Promise<SiteImportActionResult>, then?: (i: SiteImport) => void) => {
    setError(null);
    setFieldErrors({});
    start(async () => {
      const result = await work();
      if (result.error || !result.import) {
        setError(result.error ?? "That did not work.");
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setItem(result.import);
      setStep(stepFor(result.import));
      then?.(result.import);
    });
  };

  const scan = () => {
    const common = { sections, depth: Number(depth), max_pages: Number(maxPages) };

    if (source === "url") {
      act(() => startSiteImportAction({ source, start_url: address, ...common }));
      return;
    }

    if (!file || !/\.zip$/i.test(file.name)) {
      setFieldErrors({ zip: "Choose the ZIP of the site's files." });
      return;
    }

    if (file.size > limits.zip_bytes) {
      setFieldErrors({ zip: `That ZIP is over ${Math.round(limits.zip_bytes / 1048576)} MB.` });
      return;
    }

    const name = file.name.replace(/[^A-Za-z0-9._-]/g, "-");
    setError(null);
    setFieldErrors({});
    start(async () => {
      const sent = await uploadInChunks({ url: "/api/admin/imports/site/upload", file, name, chunkBytes, onProgress: setUpload });
      setUpload(null);
      if (!sent.ok) { setError(sent.error); return; }

      const result = await startSiteImportAction({ source, zip: name, ...common });
      if (result.error || !result.import) {
        setError(result.error ?? "That did not work.");
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setItem(result.import);
      setStep(stepFor(result.import));
      setFile(null);
    });
  };

  const discard = () => {
    if (!item || !window.confirm("Discard this import? Nothing has been written; the site would have to be read again.")) return;
    act(() => discardSiteImportAction(item.id), () => { setItem(null); setStep("connect"); });
  };

  // ---------------------------------------------------------------- done
  if (step === "done" && item?.result) {
    return (
      <div className="grid gap-5">
        <Alert tone="ok" title="Import finished" dismissible={false}>
          {item.site?.name || item.site_url} has been brought across{item.completed_at ? ` on ${formatDate(item.completed_at, "short")}` : ""}.
          Every page is a <strong>draft</strong>: open each, check the arrangement in the builder, and publish it when it is right.
          Importing the same site again brings in what changed since, and leaves alone any page you have edited here.
        </Alert>
        {item.result.notices.map((notice) => (
          <Alert key={notice} tone="warn" title="Worth knowing" dismissible={false}>{notice}</Alert>
        ))}
        <StepsTable steps={item.result.steps} done />
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/admin/pages" size="sm" variant="secondary">Pages</ButtonLink>
          {item.result.steps.some((s) => s.key === "posts" && s.create + s.update > 0) && <ButtonLink href="/admin/blog" size="sm" variant="secondary">Blog posts</ButtonLink>}
          {item.result.steps.some((s) => s.key === "products" && s.create + s.update > 0) && <ButtonLink href="/admin/products" size="sm" variant="secondary">Products</ButtonLink>}
          {item.result.steps.some((s) => s.key === "brand" && s.update > 0) && <ButtonLink href="/admin/settings" size="sm" variant="secondary">Appearance</ButtonLink>}
          <ButtonLink href="/admin/menus" size="sm" variant="secondary">Menus</ButtonLink>
          <ButtonLink href="/admin/media" size="sm" variant="secondary">Media</ButtonLink>
          <ButtonLink href="/admin/redirects" size="sm" variant="secondary">Redirects</ButtonLink>
          <Button type="button" size="sm" onClick={() => { setItem(null); setStep("connect"); }}>Import another site</Button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------- importing
  if (step === "importing" && item) {
    const failed = item.status === "failed";

    return (
      <div className="grid gap-4">
        {error && <Alert tone="err" title="That did not work">{error}</Alert>}
        {failed && item.error && <Alert tone="err" title="The import stopped" dismissible={false}>{item.error}</Alert>}
        <Progress
          title={failed ? "Stopped part-way" : item.progress?.commit_step ? `Importing ${item.progress.commit_step.toLowerCase()}…` : "Waiting for the queue…"}
          percent={item.progress?.commit_percent ?? 0}
          label="Import progress"
        >
          Every page is written on its own, so what is done stays done. {failed
            ? "Resume carries on from the last checkpoint; anything written twice is updated, never copied."
            : "You can leave and come back — it carries on without the page."}
        </Progress>
        {item.result && item.result.steps.length > 0 && <StepsTable steps={item.result.steps} done />}
        {failed && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => act(() => commitSiteImportAction(item.id))} disabled={busy} pending={busy}>Resume</Button>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------- review
  if (step === "review" && item?.analysis) {
    const options = item.analysis.decisions;
    const kinds = decisions.kinds ?? storedKinds(item);
    const kindChoices = options.kinds ?? KIND_FALLBACK;
    const ai = decisions.ai_assist ?? options.ai_assist?.value ?? false;
    const brand = options.brand;
    const brandChoice = {
      accept: decisions.brand?.accept ?? brand?.accept ?? false,
      colours: decisions.brand?.colours ?? brand?.use_colours ?? true,
      fonts: decisions.brand?.fonts ?? brand?.use_fonts ?? true,
    };
    const aiPlaced = item.analysis.pages.reduce((sum, p) => sum + (p.ai ?? 0), 0);
    const menus = decisions.menus ?? item.decisions?.menus ?? (options.menus ?? []).filter((m) => m.value).map((m) => m.key);
    const homepage = decisions.set_homepage ?? item.decisions?.set_homepage ?? false;
    const dirty = Object.keys(decisions).length > 0;
    const writes = item.analysis.steps.reduce((sum, s) => sum + s.create + s.update, 0);
    const rows = item.analysis.pages.filter((p) => filter === "" || `${p.path} ${p.title}`.toLowerCase().includes(filter.toLowerCase()));

    return (
      <div className="grid gap-5">
        {error && <Alert tone="err" title="That did not work">{error}</Alert>}

        <Alert tone="info" title={`${item.site?.name || item.site_url} — read`} dismissible={false}>
          {item.site ? <>{n(item.site.pages)} page{item.site.pages === 1 ? "" : "s"} read{item.site.capped ? " (the limit you set was reached)" : ""}. </> : null}
          Below is exactly what an import would do; nothing has been written. The reading is kept
          until {item.expires_at ? formatDate(item.expires_at, "short") : "it expires"}.
        </Alert>

        {item.analysis.notices.map((notice) => (
          <Alert key={notice} tone="warn" title="Worth knowing" dismissible={false}>{notice}</Alert>
        ))}

        {item.site && (
          <section className="rounded-lg border border-line-strong bg-card p-4">
            <h2 className="mb-2 text-13-5 font-semibold">What was found</h2>
            <dl className="grid gap-x-6 gap-y-1 text-13 sm:grid-cols-2">
              <Count label="Pages read" value={item.site.pages} />
              <Count label="Header, menu and footer blocks left out of the pages" value={item.site.chrome_blocks} />
              {Object.entries(item.site.menus).map(([key, count]) => <Count key={key} label={`${key === "primary" ? "Header" : "Footer"} menu links`} value={count} />)}
            </dl>
            {item.site.skipped.length > 0 && (
              <div className="mt-3">
                <h3 className="mb-1 text-12-5 font-semibold">Not brought in</h3>
                <ul className="grid gap-1.5">
                  {item.site.skipped.map((s) => (
                    <li key={s.reason} className="text-12-5">
                      <Badge tone="progress" dot={false} className="mr-1.5">{n(s.count)}</Badge>
                      {s.reason}
                      {s.examples.length > 0 && <span className="block text-muted">e.g. {s.examples.join(" · ")}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {item.site.notes.length > 0 && (
              <ul className="mt-3 list-disc pl-5 text-12-5 text-muted">
                {item.site.notes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            )}
          </section>
        )}

        <section className="grid gap-4 rounded-lg border border-line-strong bg-card p-4">
          <h2 className="text-13-5 font-semibold">Choices</h2>

          {options.set_homepage?.page && (
            <fieldset>
              <legend className="mb-1 text-13 font-semibold">The home page</legend>
              <label className="flex items-start gap-2 text-13">
                <input
                  type="checkbox" className="mt-0.5 size-4 accent-brand-600"
                  checked={homepage}
                  onChange={(e) => setDecisions({ ...decisions, set_homepage: e.target.checked })}
                />
                <span>
                  Use the imported home page (“{options.set_homepage.page.title}”) as this site&apos;s home page
                  <span className="block text-12-5 text-muted">
                    Left unticked, your current home page stays. Either way the page is a draft; the home page changes only once you publish it.
                  </span>
                </span>
              </label>
            </fieldset>
          )}

          {options.menus && options.menus.length > 0 && (
            <fieldset>
              <legend className="mb-1 text-13 font-semibold">Menus found</legend>
              <p className="measure mb-2 text-12-5 text-muted">They come across unassigned. Putting one in the header or footer is yours to do on the Menus screen.</p>
              {options.menus.map((menu) => (
                <label key={menu.key} className="mb-1.5 flex items-start gap-2 text-13">
                  <input
                    type="checkbox" className="mt-0.5 size-4 accent-brand-600"
                    checked={menus.includes(menu.key)}
                    onChange={(e) => setDecisions({ ...decisions, menus: e.target.checked ? [...menus, menu.key] : menus.filter((k) => k !== menu.key) })}
                  />
                  <span>{menu.label}<span className="text-muted"> — {n(menu.items)} link{menu.items === 1 ? "" : "s"}</span></span>
                </label>
              ))}
            </fieldset>
          )}

          {options.ai_assist && (
            <fieldset>
              <legend className="mb-1 text-13 font-semibold">Pages the rules cannot place</legend>
              <label className="flex items-start gap-2 text-13">
                <Switch className="mt-px" checked={ai && options.ai_assist.available} disabled={busy || !options.ai_assist.available}
                  onChange={(e) => setDecisions({ ...decisions, ai_assist: e.currentTarget.checked })} />
                <span>
                  <span className="font-semibold">Use AI to place what the rules could not</span>
                  <span className="block text-12-5 text-muted">
                    {options.ai_assist.available
                      ? "A block with enough words and shape, and a page the rules cannot sort into page, post or product, is shown to the AI assistant as plain text and placed in a section. It may only use the block's own words, and it counts against the assistant's daily limit. Off, those blocks stay text and those pages stay pages."
                      : `Not available: ${options.ai_assist.reason ?? "the AI assistant is not set up."}`}
                  </span>
                </span>
              </label>
            </fieldset>
          )}

          {brand && (
            <BrandPanel
              brand={brand}
              accept={brandChoice.accept}
              colours={brandChoice.colours}
              fonts={brandChoice.fonts}
              busy={busy}
              onChange={(next) => setDecisions({ ...decisions, brand: { ...brandChoice, ...next } })}
            />
          )}

          <div>
            <Button type="button" variant="secondary" size="sm" disabled={busy || !dirty} pending={busy && dirty}
              onClick={() => act(() => saveSiteDecisionsAction(item.id, decisions), () => setDecisions({}))}>
              Apply choices and recount
            </Button>
          </div>
        </section>

        <StepsTable steps={item.analysis.steps} />

        <section>
          <h2 className="mb-2 text-13-5 font-semibold">Pages ({n(item.analysis.pages.length)})</h2>
          <p className="measure mb-2 text-12-5 text-muted">
            Each page is a page, a blog post or a catalogue product, found from what it says about itself. Change it where it is wrong, or leave a page out, then apply your choices. Everything is laid out in sections you can rearrange in the builder.
            {aiPlaced > 0 && <> The AI placed {n(aiPlaced)} section{aiPlaced === 1 ? "" : "s"}; they are marked, so look at those first.</>}
          </p>
          <div className="mb-2 max-w-sm">
            <Field label="Find a page" htmlFor="site-filter" className="mb-0">
              <Input id="site-filter" value={filter} onChange={(e) => { setFilter(e.target.value); setShown(PAGE_ROWS); }} placeholder="Part of an address or a title" />
            </Field>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
            <table className="admin-table w-full min-w-[640px] text-13">
              <thead>
                <tr className="border-b border-line text-left text-11 uppercase tracking-[.05em] text-muted">
                  <th scope="col" className="px-3 py-2">Page</th>
                  <th scope="col" className="px-3 py-2">It becomes</th>
                  <th scope="col" className="px-3 py-2">Result</th>
                  <th scope="col" className="px-3 py-2">Sections</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map((page) => {
                  const kind = kinds[page.path] ?? page.kind ?? "page";
                  return (
                    <tr key={page.path} className="border-b border-line align-top last:border-0">
                      <td data-label="Page" className="px-3 py-1.5">
                        <span className="block font-semibold">{page.title}</span>
                        <span className="font-mono text-12-5 text-muted">{page.path}</span>
                      </td>
                      <td data-label="It becomes" className="px-3 py-1.5">
                        <Select
                          aria-label={`What ${page.title} becomes`}
                          className="min-w-[9rem] text-13"
                          value={kind}
                          disabled={busy}
                          onChange={(e) => setDecisions({ ...decisions, kinds: { ...kinds, [page.path]: e.currentTarget.value as SiteImportKind } })}
                        >
                          {kindChoices.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                        </Select>
                        {kinds[page.path] === undefined && page.by && page.by !== "rules" && (
                          <span className="mt-1 block text-12 text-muted">{page.by === "ai" ? "Chosen by the AI" : "Your choice"}</span>
                        )}
                      </td>
                      <td data-label="Result" className="px-3 py-1.5">
                        <Badge tone={page.action === "skip" ? "urgent" : page.action === "update" ? "progress" : "resolved"} dot={false}>
                          {page.action === "skip" ? "skipped" : page.action === "update" ? "update" : "new draft"}
                        </Badge>
                        {page.note && <span className="mt-1 block text-12-5 text-muted">{page.note}</span>}
                      </td>
                      <td data-label="Sections" className="px-3 py-1.5 text-12-5">
                        {page.sections === 0 ? <span className="text-muted">—</span> : (
                          <>
                            {n(page.sections)}
                            <span className="block text-muted">{Object.entries(page.types).map(([t, c]) => typeLabel(t, c)).join(", ")}</span>
                            {(page.ai ?? 0) > 0 && <Badge tone="progress" dot={false} className="mt-1">AI placed {n(page.ai)}</Badge>}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-3 text-muted">No page matches.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {rows.length > shown && (
            <div className="mt-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShown(shown + PAGE_ROWS)}>
                {`Show ${Math.min(PAGE_ROWS, rows.length - shown)} more (${n(rows.length - shown)} left)`}
              </Button>
            </div>
          )}
        </section>

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button type="button" onClick={() => act(() => commitSiteImportAction(item.id))} disabled={busy || dirty || writes === 0} pending={busy && !dirty}>
            {`Import ${n(writes)} record${writes === 1 ? "" : "s"}`}
          </Button>
          <Button type="button" variant="secondary" onClick={discard} disabled={busy}>Discard</Button>
          {dirty && <p className="self-center text-12-5 text-muted">Apply your choices first — the counts above are from before them.</p>}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- reading
  if (step === "reading" && item) {
    const p = item.progress;
    const analysing = item.status === "analysing";
    const label = item.status === "pending"
      ? "Waiting for the queue…"
      : analysing ? "Working out what would come across…" : `${PHASES[p?.phase ?? "crawl"] ?? "Reading the site"}…`;

    return (
      <div className="grid gap-4">
        {error && <Alert tone="err" title="That did not work">{error}</Alert>}
        <Progress
          title={label}
          percent={analysing ? p?.analyse_percent ?? 0 : 0}
          label="Reading progress"
          subtitle={item.site_url}
        >
          {p && (p.pages > 0 || p.zip_files > 0) && (
            <dl className="mb-3 grid gap-x-6 gap-y-1 text-13 sm:grid-cols-2">
              <Count label="Pages read" value={p.pages} />
              {item.source === "url" ? <Count label="Waiting to be read" value={p.queued} /> : <Count label="Files unpacked" value={p.zip_files} />}
            </dl>
          )}
          {p?.current && <p className="mb-2 truncate font-mono text-12-5">{p.current}</p>}
          A large site takes a while: it is read in short slices from the queue, politely, and this page follows along.
          You can leave and come back.
        </Progress>
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={discard} disabled={busy}>Cancel</Button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- connect
  return (
    <div className="grid gap-5">
      <DeliveryStatus queue={queue} subject="import" />
      {error && <Alert tone="err" title="That did not work">{error}</Alert>}
      {item?.status === "failed" && item.error && !error && <Alert tone="err" title="The last scan stopped">{item.error}</Alert>}

      <form className="grid max-w-2xl gap-1" onSubmit={(e) => { e.preventDefault(); scan(); }}>
        <fieldset className="mb-4">
          <legend className="mb-2 text-13 font-semibold">Where is the site?</legend>
          <Radio name="source" value="url" checked={source === "url"} onChange={() => setSource("url")}
            label="A web address" hint="The site is read page by page, politely, staying on its own address and obeying its robots.txt." />
          <Radio name="source" value="zip" checked={source === "zip"} onChange={() => setSource("zip")}
            label="A ZIP of its files" hint="An export or a folder of HTML, CSS and pictures. Nothing in it is ever run or served." />
        </fieldset>

        {source === "url" ? (
          <>
            <Field label="The site's address" htmlFor="site-address" error={fieldErrors.start_url} hint="Its home page, e.g. https://www.example.in">
              <Input id="site-address" name="start_url" type="url" inputMode="url" required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="https://" />
            </Field>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="How many clicks deep" htmlFor="site-depth" variant="float-static" error={fieldErrors.depth} hint="0 reads only that page; 3 follows links three levels down.">
                <Select id="site-depth" name="depth" value={depth} onChange={(e) => setDepth(e.target.value)}>
                  {Array.from({ length: limits.depth + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}
                </Select>
              </Field>
              <Field label="At most this many pages" htmlFor="site-pages" error={fieldErrors.max_pages} hint={`Up to ${n(limits.pages)}.`}>
                <Input id="site-pages" name="max_pages" type="number" min={1} max={limits.pages} value={maxPages} onChange={(e) => setMaxPages(e.target.value)} />
              </Field>
            </div>
          </>
        ) : (
          <Field label="The ZIP" htmlFor="site-zip" error={fieldErrors.zip} hint={`Up to ${Math.round(limits.zip_bytes / 1048576)} MB. It is sent in pieces, so a large one is fine.`}>
            <FileInput id="site-zip" name="zip" accept=".zip,application/zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        )}

        <fieldset className="mb-4">
          <legend className="mb-2 text-13 font-semibold">What to bring across</legend>
          <p className="measure mb-2 text-12-5 text-muted">Pages come with their pictures, files and search-engine details, always, as drafts.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SECTIONS.map((s) => (
              <label key={s.value} className="flex items-start gap-2 rounded-lg border border-line-strong bg-card p-3 text-13">
                <input
                  type="checkbox" className="mt-0.5 size-4 accent-brand-600"
                  checked={sections.includes(s.value)}
                  onChange={(e) => setSections(e.target.checked ? [...sections, s.value] : sections.filter((v) => v !== s.value))}
                />
                <span><span className="font-semibold">{s.label}</span><span className="block text-12-5 text-muted">{s.hint}</span></span>
              </label>
            ))}
          </div>
          {fieldErrors.sections && <p className="mt-1 text-12-5 text-err">{fieldErrors.sections}</p>}
        </fieldset>

        {fieldErrors.queue && <Alert tone="err" title="Nothing is running the queue">{fieldErrors.queue}</Alert>}

        {upload && (
          <Progress title="Sending the ZIP…" percent={Math.round((upload.done / upload.total) * 100)} label="Upload progress">
            {upload.done} of {upload.total} pieces sent.
          </Progress>
        )}

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button type="submit" disabled={busy} pending={busy}>{source === "zip" ? "Upload and read" : "Read the site"}</Button>
        </div>
      </form>

      {history.length > 0 && (
        <section>
          <h2 className="mb-2 text-13-5 font-semibold">Earlier imports</h2>
          <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
            <table className="admin-table w-full min-w-[520px] text-13">
              <thead>
                <tr className="border-b border-line text-left text-11 uppercase tracking-[.05em] text-muted">
                  <th scope="col" className="px-3 py-2">Site</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2">Started</th>
                  <th scope="col" className="px-3 py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-line last:border-0">
                    <td data-label="Site" className="px-3 py-1.5">{h.site_name || h.site_url}</td>
                    <td data-label="Status" className="px-3 py-1.5">
                      <Badge tone={h.status === "completed" ? "resolved" : h.status === "failed" ? "urgent" : "closed"} dot={false}>{h.status}</Badge>
                    </td>
                    <td data-label="Started" className="px-3 py-1.5">{h.created_at ? formatDate(h.created_at, "short") : "—"}</td>
                    <td data-label="By" className="px-3 py-1.5">{h.uploaded_by ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
