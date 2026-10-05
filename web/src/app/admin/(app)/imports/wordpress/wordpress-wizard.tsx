"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { PasswordField } from "@/components/ui/password-field";
import { Badge } from "@/components/ui/badge";
import { DeliveryStatus } from "../../newsletter/campaigns/delivery-status";
import { Count } from "../../newsletter/subscribers/import/count";
import { formatDate } from "@/lib/dates";
import {
  commitImportAction, discardImportAction, pollImportAction, saveDecisionsAction, startImportAction,
} from "./actions";
import type {
  QueueHealth, WordPressImport, WordPressImportDecisions, WordPressImportSection, WordPressImportStep,
} from "@/types/api";

/**
 * Import a WordPress site: connect → reading → review → importing → done.
 *
 * Everything after "connect" is queued work, so the screen polls the import
 * row every three seconds and draws what it says — and starts on whatever
 * the API reports as the import in hand, so a page reloaded mid-scan lands
 * back on the progress panel and one reloaded after it on the review. The
 * mailbox import's shape, for the same reasons.
 *
 * The review is the point of the screen: nothing is written until somebody
 * has read what will come across, what will not and why, grouped by reason.
 * Changing a choice there re-runs the dry run, so the counts on the screen
 * are always the counts the commit will produce.
 */

type Step = "connect" | "reading" | "review" | "importing" | "done";

const SECTIONS: { value: WordPressImportSection; label: string; hint: string }[] = [
  { value: "content", label: "Content", hint: "Posts, pages, categories, comments, menus, SEO and the pictures they use." },
  { value: "catalogue", label: "Shop catalogue", hint: "WooCommerce products and their options, categories, brands, stock and reviews." },
  { value: "customers", label: "Customers and orders", hint: "Accounts with their addresses, coupons, and every order with its payments, refunds and notes." },
  { value: "custom", label: "Custom fields and post types", hint: "ACF values as custom fields, and custom post types as content types." },
];

const KINDS = ["text", "textarea", "rich_text", "number", "date", "url", "email", "boolean", "image", "file", "list"];

const WORKING = ["pending", "scanning", "analysing", "running"];

function stepFor(item: WordPressImport | null): Step {
  if (!item) return "connect";
  if (["pending", "scanning", "analysing"].includes(item.status)) return "reading";
  if (item.status === "ready") return "review";
  if (item.status === "running") return "importing";
  if (item.status === "completed") return "done";
  if (item.status === "failed" && item.can_resume) return "importing";
  return "connect";
}

const n = (value: number) => value.toLocaleString("en-IN");

/** A custom-field target as a person reads it. */
const TARGETS: Record<string, string> = { blog_post: "Blog posts", page: "Pages", store_product: "Shop products" };

function targetLabel(target: string): string {
  return TARGETS[target] ?? (target.startsWith("entry:") ? `Entries: ${target.slice(6)}` : target.replace(/_/g, " "));
}

export function WordPressImportWizard({
  active, history, queue,
}: {
  active: WordPressImport | null;
  history: WordPressImport[];
  queue: QueueHealth | null;
}) {
  const [item, setItem] = useState<WordPressImport | null>(active);
  const [step, setStep] = useState<Step>(stepFor(active));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, start] = useTransition();

  // Connect.
  const [site, setSite] = useState("");
  const [sections, setSections] = useState<WordPressImportSection[]>(["content", "catalogue", "customers", "custom"]);
  const [wpUser, setWpUser] = useState("");
  const [wpPassword, setWpPassword] = useState("");
  const [wcKey, setWcKey] = useState("");
  const [wcSecret, setWcSecret] = useState("");
  const needsWoo = sections.includes("catalogue") || sections.includes("customers");

  // Review choices, seeded from the analysis each time the review opens.
  const [decisions, setDecisions] = useState<WordPressImportDecisions>({});

  useEffect(() => {
    if (!item || !WORKING.includes(item.status)) return;
    const id = window.setInterval(async () => {
      const fresh = await pollImportAction(item.id);
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

  const act = (work: () => Promise<{ import?: WordPressImport; error?: string; fieldErrors?: Record<string, string> }>, then?: (i: WordPressImport) => void) => {
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

  const scan = () => act(() => startImportAction({
    site_url: site, sections, wp_user: wpUser, wp_password: wpPassword,
    ...(needsWoo && wcKey !== "" ? { wc_key: wcKey, wc_secret: wcSecret } : {}),
  }), () => setWpPassword(""));

  const discard = () => {
    if (!item || !window.confirm("Discard this import? Nothing has been written; the site would have to be read again.")) return;
    act(() => discardImportAction(item.id), () => { setItem(null); setStep("connect"); });
  };

  // ---------------------------------------------------------------- done
  if (step === "done" && item?.result) {
    return (
      <div className="grid gap-5">
        <Alert tone="ok" title="Import finished" dismissible={false}>
          {item.site?.name || item.site_url} has been brought across{item.completed_at ? ` on ${formatDate(item.completed_at, "short")}` : ""}.
          Importing the same site again brings in what changed since, and updates rather than copies what is here.
        </Alert>
        <StepsTable steps={item.result.steps} done />
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/admin/blog" size="sm" variant="secondary">Blog</ButtonLink>
          <ButtonLink href="/admin/pages" size="sm" variant="secondary">Pages</ButtonLink>
          <ButtonLink href="/admin/store/products" size="sm" variant="secondary">Products</ButtonLink>
          <ButtonLink href="/admin/store/orders" size="sm" variant="secondary">Orders</ButtonLink>
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
          Every record is written on its own, so what is done stays done. {failed
            ? "Resume carries on from the last checkpoint; anything written twice is updated, never copied."
            : "You can leave and come back — it carries on without the page."}
        </Progress>
        {item.result && item.result.steps.length > 0 && <StepsTable steps={item.result.steps} done />}
        {failed && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => act(() => commitImportAction(item.id))} disabled={busy} pending={busy}>Resume</Button>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------- review
  if (step === "review" && item?.analysis) {
    const options = item.analysis.decisions;
    const chosen = (key: keyof WordPressImportDecisions) => decisions[key] ?? item.decisions?.[key];
    const dirty = Object.keys(decisions).length > 0;
    const writes = item.analysis.steps.reduce((sum, s) => sum + s.create + s.update, 0);

    return (
      <div className="grid gap-5">
        {error && <Alert tone="err" title="That did not work">{error}</Alert>}

        <Alert tone="info" title={`${item.site?.name || item.site_url} — read`} dismissible={false}>
          The site has been read and the credentials let go of. Below is exactly what an import would do; nothing has been
          written. The reading is kept until {item.expires_at ? formatDate(item.expires_at, "short") : "it expires"}.
        </Alert>

        {item.analysis.notices.map((notice) => (
          <Alert key={notice} tone="warn" title="Worth knowing" dismissible={false}>{notice}</Alert>
        ))}

        {item.site && Object.keys(item.site.missing).length > 0 && (
          <Alert tone="info" title="Parts of the site that could not be read" dismissible={false}>
            <ul className="mt-1 list-disc pl-5">
              {Object.entries(item.site.missing).map(([what, why]) => <li key={what}><strong>{what.replace(/_/g, " ")}</strong>: {why}</li>)}
            </ul>
          </Alert>
        )}

        {options.newsletter && options.newsletter.customers > 0 && (
          <Alert tone="warn" title={`${n(options.newsletter.customers)} customers will join “${options.newsletter.group}”`} dismissible={false}>
            Imported customers join the newsletter&apos;s customer group like any other account.
            {options.newsletter.sequences.length > 0
              ? <> These running sequences will then email them: <strong>{options.newsletter.sequences.join(", ")}</strong>. Pause them first if that is not wanted.</>
              : <> No running sequence is attached to it, so nobody is emailed by joining.</>}
          </Alert>
        )}

        <section className="grid gap-4 rounded-lg border border-line-strong bg-card p-4">
          <h2 className="text-13-5 font-semibold">Choices</h2>

          {options.tax_basis && (
            <fieldset>
              <legend className="mb-1 text-13 font-semibold">WooCommerce added tax on top of its prices</legend>
              <p className="measure mb-2 text-12-5 text-muted">This shop&apos;s prices include GST. Order totals are history and never change either way.</p>
              <Radio name="tax_basis" value="keep" checked={chosen("tax_basis") !== "add_gst"} onChange={() => setDecisions({ ...decisions, tax_basis: "keep" })}
                label="Keep the numbers" hint="Each price stays as it was and now includes GST — so customers pay 18% less than before." />
              <Radio name="tax_basis" value="add_gst" checked={chosen("tax_basis") === "add_gst"} onChange={() => setDecisions({ ...decisions, tax_basis: "add_gst" })}
                label="Add GST to every price" hint="Each price grows by 18%, so customers pay what they paid before." />
            </fieldset>
          )}

          {options.page_layout && (
            <fieldset>
              <legend className="mb-1 text-13 font-semibold">How pages arrive{options.page_layout.pages ? ` (${n(options.page_layout.pages)})` : ""}</legend>
              <Radio name="page_layout" value="sections" checked={chosen("page_layout") !== "html"} onChange={() => setDecisions({ ...decisions, page_layout: "sections" })}
                label="As builder sections" hint="Laid out from the WordPress blocks — a cover becomes the hero, columns become features, a quote a testimonial — or split at each main heading. Ready to rearrange in the builder." />
              <Radio name="page_layout" value="html" checked={chosen("page_layout") === "html"} onChange={() => setDecisions({ ...decisions, page_layout: "html" })}
                label="As one text body" hint="Each page in the text editor, as it was on the old site. It can still be laid out as sections later, from the builder." />
            </fieldset>
          )}

          <fieldset>
            <legend className="mb-1 text-13 font-semibold">Pictures and files</legend>
            <Radio name="media_scope" value="referenced" checked={chosen("media_scope") !== "all"} onChange={() => setDecisions({ ...decisions, media_scope: "referenced" })}
              label="Only what the imported content shows" hint="Featured images, galleries, pictures in bodies, linked files." />
            <Radio name="media_scope" value="all" checked={chosen("media_scope") === "all"} onChange={() => setDecisions({ ...decisions, media_scope: "all" })}
              label={`The whole media library${options.media_scope ? ` (${n(options.media_scope.library)} files)` : ""}`} hint="Years of uploads usually include much that nothing shows any more." />
          </fieldset>

          {options.content_types && options.content_types.length > 0 && (
            <fieldset>
              <legend className="mb-1 text-13 font-semibold">Custom post types</legend>
              <p className="measure mb-2 text-12-5 text-muted">Each becomes a content type with pages at the address below. Leave an address blank to leave that type out.</p>
              <div className="grid gap-2 sm:max-w-xl">
                {options.content_types.map((type) => (
                  <div key={type.source} className="flex flex-wrap items-center gap-2 text-13">
                    <span className="min-w-[10rem] font-semibold">{type.name} <span className="font-normal text-muted">({n(type.entries)})</span></span>
                    {type.imported ? (
                      <span className="text-muted">Already imported at /{type.slug}</span>
                    ) : (
                      <label className="flex items-center gap-1">
                        <span className="text-muted">/</span>
                        <input
                          className="w-40 rounded-md border border-line-strong bg-card px-2 py-1 font-mono text-12-5"
                          aria-label={`Address for ${type.name}`}
                          defaultValue={type.slug}
                          onChange={(e) => setDecisions({ ...decisions, type_slugs: { ...(decisions.type_slugs ?? {}), [type.source]: e.target.value } })}
                        />
                      </label>
                    )}
                    {type.problem && <span className="text-12-5 text-err">That address {type.problem}.</span>}
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          {options.acf && Object.keys(options.acf).length > 0 && (
            <fieldset>
              <legend className="mb-1 text-13 font-semibold">ACF fields</legend>
              <p className="measure mb-2 text-12-5 text-muted">
                Each kind was worked out from the values found. Change it where it is wrong, or leave a field out.
              </p>
              {Object.entries(options.acf).map(([target, fields]) => (
                <div key={target} className="mb-3">
                  <h3 className="mb-1 text-12-5 font-semibold">{targetLabel(target)}</h3>
                  <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="admin-table w-full min-w-[480px] text-13">
                    <thead>
                      <tr className="border-b border-line text-left text-11 uppercase tracking-[.05em] text-muted">
                        <th scope="col" className="px-3 py-2">Field</th>
                        <th scope="col" className="px-3 py-2 text-right">On</th>
                        <th scope="col" className="px-3 py-2">Becomes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((field) => (
                        <tr key={field.source} className="border-b border-line last:border-0">
                          <td data-label="Field" className="px-3 py-1.5"><span className="font-mono text-12-5">{field.source}</span></td>
                          <td data-label="On" className="px-3 py-1.5 text-right tabular-nums">{n(field.count)}</td>
                          <td data-label="Becomes" className="px-3 py-1.5">
                            {field.unsupported ? (
                              <span className="text-12-5 text-muted">Not kept — {field.unsupported}</span>
                            ) : (
                              <Select
                                aria-label={`Kind for ${field.source}`}
                                className="w-auto py-1 text-12-5"
                                defaultValue={item.decisions?.acf_kinds?.[target]?.[field.source] ?? field.kind ?? "text"}
                                onChange={(e) => setDecisions({
                                  ...decisions,
                                  acf_kinds: { ...(decisions.acf_kinds ?? {}), [target]: { ...(decisions.acf_kinds?.[target] ?? {}), [field.source]: e.target.value } },
                                })}
                              >
                                {KINDS.map((kind) => <option key={kind} value={kind}>{kind.replace("_", " ")}</option>)}
                                <option value="skip">leave out</option>
                              </Select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              ))}
            </fieldset>
          )}

          <div>
            <Button type="button" variant="secondary" size="sm" disabled={busy || !dirty} pending={busy && dirty}
              onClick={() => act(() => saveDecisionsAction(item.id, decisions), () => setDecisions({}))}>
              Apply choices and recount
            </Button>
          </div>
        </section>

        <StepsTable steps={item.analysis.steps} />

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button type="button" onClick={() => act(() => commitImportAction(item.id))} disabled={busy || dirty || writes === 0} pending={busy && !dirty}>
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
    const percent = analysing
      ? p?.analyse_percent ?? 0
      : p && p.tasks_total > 0 ? Math.round((p.tasks_done / p.tasks_total) * 100) : 0;

    return (
      <div className="grid gap-4">
        {error && <Alert tone="err" title="That did not work">{error}</Alert>}
        <Progress
          title={item.status === "pending" ? "Waiting for the queue…" : analysing ? "Working out what would come across…" : `Reading ${p?.current?.replace(/_/g, " ") ?? "the site"}…`}
          percent={percent}
          label="Reading progress"
          subtitle={item.site_url}
        >
          {p && Object.keys(p.collections).length > 0 && (
            <dl className="mb-3 grid gap-x-6 gap-y-1 text-13 sm:grid-cols-2">
              {Object.entries(p.collections).map(([key, count]) => <Count key={key} label={key.replace(/^cpt:/, "").replace(/_/g, " ")} value={count} />)}
            </dl>
          )}
          A large shop takes a while: the site is read in short slices from the queue, and this page follows along.
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
        <Field label="The site's address" htmlFor="wp-site" error={fieldErrors.site_url} hint="Its home page, e.g. https://www.example.in">
          <Input id="wp-site" name="site_url" type="url" inputMode="url" required value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://" />
        </Field>

        <fieldset className="mb-4">
          <legend className="mb-2 text-13 font-semibold">What to bring across</legend>
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

        <p className="measure mb-2 text-12-5 text-muted">
          An <strong>application password</strong> lets the import see drafts, private pages, authors and menus. In WordPress:
          Users → Profile → Application Passwords. It is used for this scan and never stored.
        </p>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="WordPress username" htmlFor="wp-user" error={fieldErrors.wp_user}>
            <Input id="wp-user" name="wp_user" autoComplete="off" required value={wpUser} onChange={(e) => setWpUser(e.target.value)} />
          </Field>
          <PasswordField label="Application password" htmlFor="wp-password" name="wp_password" autoComplete="off" required
            error={fieldErrors.wp_password} value={wpPassword} onChange={(e) => setWpPassword(e.target.value)} />
        </div>

        {needsWoo && (
          <>
            <p className="measure mb-2 text-12-5 text-muted">
              The shop is read through <strong>WooCommerce&apos;s REST API</strong>. The application password above is enough
              when its user is a shop manager or an administrator. A REST key (WooCommerce → Settings → Advanced → REST API,
              <em>Read</em> access) can be used instead — optional, and also used for this scan only.
            </p>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Consumer key (optional)" htmlFor="wc-key" error={fieldErrors.wc_key}>
                <Input id="wc-key" name="wc_key" autoComplete="off" value={wcKey} onChange={(e) => setWcKey(e.target.value)} placeholder="ck_…" className="font-mono" />
              </Field>
              <PasswordField label="Consumer secret" htmlFor="wc-secret" name="wc_secret" autoComplete="off" required={wcKey !== ""}
                error={fieldErrors.wc_secret} value={wcSecret} onChange={(e) => setWcSecret(e.target.value)} />
            </div>
          </>
        )}

        {fieldErrors.queue && <Alert tone="err" title="Nothing is running the queue">{fieldErrors.queue}</Alert>}

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button type="submit" disabled={busy || sections.length === 0} pending={busy}>Read the site</Button>
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

function Radio({ name, value, checked, onChange, label, hint }: {
  name: string; value: string; checked: boolean; onChange: () => void; label: string; hint: string;
}) {
  return (
    <label className="mb-1.5 flex items-start gap-2 text-13">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="mt-0.5 size-4 accent-brand-600" />
      <span>{label}<span className="block text-12-5 text-muted">{hint}</span></span>
    </label>
  );
}

function Progress({ title, subtitle, percent, label, children }: {
  title: string; subtitle?: string; percent: number; label: string; children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line-strong bg-card p-4">
      <p className="text-13-5 font-semibold text-ink">{title}</p>
      {subtitle && <p className="mt-0.5 text-12-5 text-muted">{subtitle}</p>}
      <div className="my-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={label}>
        <div className="h-full rounded-full bg-brand-600 transition-[width] duration-(--duration-slow)" style={{ width: `${Math.max(4, percent)}%` }} />
      </div>
      <div className="text-12-5 text-muted">{children}</div>
    </div>
  );
}

/** The plan (or the result), one row per kind of record, with every reason a record was skipped or lost something. */
function StepsTable({ steps, done = false }: { steps: WordPressImportStep[]; done?: boolean }) {
  return (
    <section>
      <h2 className="mb-2 text-13-5 font-semibold">{done ? "What was brought across" : "What an import would do"}</h2>
      <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
        <table className="admin-table w-full min-w-[560px] text-13">
          <thead>
            <tr className="border-b border-line text-left text-11 uppercase tracking-[.05em] text-muted">
              <th scope="col" className="px-3 py-2">What</th>
              <th scope="col" className="px-3 py-2 text-right">{done ? "Added" : "New"}</th>
              <th scope="col" className="px-3 py-2 text-right">{done ? "Updated" : "Update"}</th>
              <th scope="col" className="px-3 py-2 text-right">Skipped</th>
              <th scope="col" className="px-3 py-2">Why, and what does not come across</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s) => (
              <tr key={s.key} className="border-b border-line align-top last:border-0">
                <th scope="row" data-label="What" className="px-3 py-2 text-left font-semibold">{s.label}</th>
                <td data-label={done ? "Added" : "New"} className="px-3 py-2 text-right tabular-nums">{n(s.create)}</td>
                <td data-label={done ? "Updated" : "Update"} className="px-3 py-2 text-right tabular-nums">{n(s.update)}</td>
                <td data-label="Skipped" className="px-3 py-2 text-right tabular-nums">{n(s.skip)}</td>
                <td data-label="Why" className="px-3 py-2">
                  {s.reasons.length === 0 ? <span className="text-muted">—</span> : (
                    <ul className="grid gap-1.5">
                      {s.reasons.map((r) => (
                        <li key={r.reason} className="text-12-5">
                          <Badge tone={r.kind === "skip" ? "urgent" : "progress"} dot={false} className="mr-1.5">{n(r.count)}</Badge>
                          {r.reason}
                          {r.examples.length > 0 && <span className="block text-muted">e.g. {r.examples.join(" · ")}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
