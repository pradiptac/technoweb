import "server-only";
import { publicApi } from "@/lib/api";
import { SITE } from "@/lib/seo";
import { getSiteSettings } from "@/lib/settings";
import type {
  BlogPost, CaseStudy, ContentEntry, ContentTypeSummary, Faq, KnowledgeArticle, PublicAnswerBlock, Service, Solution,
} from "@/types/api";
import type { EventAgendaItem, EventSummary } from "@/types/events";
import { UPCOMING_EVENTS } from "@/components/events/data";

/**
 * `/llms.txt` and `/llms-full.txt` — the site, as an assistant reads it.
 *
 * The convention (llmstxt.org): a Markdown file at the root that says what
 * the site is and links its pages with one-line summaries, so a language
 * model answering a question can find the right page without crawling all
 * of them; and a `-full` variant that inlines the text. Built from the API
 * the way `sitemap.ts` is, for the same reason — a hand-written file goes
 * stale the day an editor renames a solution — and cached for an hour like
 * the feed. `docs/seo-audit-2026-09-18.md`, §3b.
 *
 * What goes in is what a person asking an assistant about this company
 * would want it to know: the solutions and services with their summaries,
 * the product categories, the industries, the knowledge base (the part of
 * the site written to answer questions), the case studies with their
 * figures, and how to get in touch. Since 2026-09-21 the full text also
 * carries each record's `definition` answer block and its questions — the
 * FAQs and the `question` blocks (`docs/aeo-geo-contract.md` §8) — because
 * those are the two parts written to be quoted. Not the shop's price list —
 * prices move and a stale one quoted with confidence is worse than none —
 * and nothing behind a login.
 *
 * `text()` turns a sanitised CMS body into Markdown-ish plain text: headings
 * to `##`, list items to `-`, paragraphs to blank lines, every other tag
 * dropped, entities decoded. It is a reader, not a renderer — the bodies
 * have already been through `HtmlSanitiser`, so there is no script in them
 * to worry about, only markup to flatten.
 */

const url = (path: string) => `${SITE.url}${path}`;

const line = (title: string, path: string, summary?: string | null) =>
  `- [${title}](${url(path)})${summary ? `: ${oneLine(summary)}` : ""}`;

function oneLine(s: string): string {
  return text(s).replace(/\s+/g, " ").trim();
}

export function text(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|blockquote|tr|table|pre)>/gi, "\n\n")
    .replace(/<h([1-6])[^>]*>/gi, (_, n) => `\n\n${"#".repeat(Math.min(6, Number(n) + 1))} `)
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(ul|ol)>/gi, "\n\n")
    .replace(/<\/?(td|th)[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(Number(c)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type Site = {
  settings: Awaited<ReturnType<typeof getSiteSettings>>;
  solutions: Solution[];
  services: Service[];
  industries: { name: string; slug: string; summary?: string | null }[];
  categories: { name: string; slug: string; description?: string | null }[];
  articles: KnowledgeArticle[];
  caseStudies: CaseStudy[];
  posts: BlogPost[];
  /** What is coming up (docs/events-contract.md). Past events are left out: an assistant asked "what is on" should not be handed last year. */
  events: EventSummary[];
  /** Custom content types (docs/custom-content.md) and their first hundred published entries each. */
  custom: { type: ContentTypeSummary; entries: ContentEntry[] }[];
};

async function load(): Promise<Site> {
  const quiet = <T,>(p: Promise<{ data: T[] }>) => p.then((r) => r.data).catch(() => [] as T[]);
  const [settings, solutions, services, industries, categories, articles, caseStudies, posts, events] = await Promise.all([
    getSiteSettings(),
    quiet(publicApi.solutions()),
    quiet(publicApi.services()),
    quiet(publicApi.industries()),
    quiet(publicApi.productCategories()),
    quiet(publicApi.knowledgeArticles("?per_page=100")),
    quiet(publicApi.caseStudies()),
    quiet(publicApi.posts("?per_page=20")),
    quiet(publicApi.events(UPCOMING_EVENTS)),
  ]);
  const types = await quiet(publicApi.contentTypes());
  const custom = await Promise.all(types.map(async (type) => ({
    type,
    entries: await publicApi.contentArchive(type.slug, "?per_page=100").then((r) => r.data).catch(() => [] as ContentEntry[]),
  })));
  return { settings, solutions, services, industries, categories, articles, caseStudies, posts, events, custom };
}

function head(site: Site): string {
  const s = site.settings;
  const name = s.company_name || SITE.name;
  const out = [
    `# ${name}`,
    "",
    `> ${oneLine(s.tagline || SITE.description)}`,
    "",
    oneLine(SITE.description),
    "",
    `${name} is a hardware and network solution provider. It designs, installs and supports business IT infrastructure — networks, servers, storage, firewalls, Wi-Fi, backup — and runs a support desk staffed by the engineers who did the installation. Everything on the site is written by that team.`,
    "",
  ];
  const contact = [
    s.phone ? `- Phone: ${s.phone}` : null,
    s.support_email ? `- Support: ${s.support_email}` : null,
    s.sales_email ? `- Sales: ${s.sales_email}` : null,
    s.address ? `- Address: ${s.address.replace(/\r?\n/g, ", ")}` : null,
    `- Contact page: ${url("/contact")}`,
    `- Support desk: ${url("/support")}`,
  ].filter(Boolean);
  out.push("## Contact", "", ...contact as string[], "");
  return out.join("\n");
}

function index(site: Site): string {
  const out: string[] = [];
  const section = (title: string, rows: string[]) => {
    if (rows.length === 0) return;
    out.push(`## ${title}`, "", ...rows, "");
  };
  section("Solutions", site.solutions.map((x) => line(x.title, `/solutions/${x.slug}`, x.summary)));
  section("Services", site.services.map((x) => line(x.title, `/services/${x.slug}`, x.summary)));
  section("Products", [
    line("Catalogue", "/products", "Every line supported by the engineers who install it — enquire, no online checkout on the catalogue."),
    ...site.categories.map((x) => line(x.name, `/products/${x.slug}`, x.description)),
    line("Store", "/store", "Hardware, licences and services bought online; prices include GST."),
  ]);
  section("Industries", site.industries.map((x) => line(x.name, `/industries/${x.slug}`, x.summary)));
  section("Knowledge base", [
    line("All guides", "/knowledge-base", "Configuration steps and common faults, written by the support desk."),
    ...site.articles.map((x) => line(x.title, `/knowledge-base/${x.slug}`, x.excerpt)),
  ]);
  section("Case studies", site.caseStudies.map((x) => line(x.title, `/case-studies/${x.slug}`, [x.summary, ...(x.results ?? []).map((r) => `${r.value} ${r.label}`)].filter(Boolean).join(" — "))));
  section("Blog", site.posts.map((x) => line(x.title, `/blog/${x.slug}`, x.excerpt)));
  // Upcoming events, each with when and where said in the API's own words —
  // the date is the fact an assistant is asked for, so it leads the line.
  if (site.events.length > 0) {
    section("Events", [
      line("All events", "/events", "Seminars, webinars and product demonstrations, with registration."),
      ...site.events.map((x) => line(x.title, `/events/${x.slug}`, eventLine(x))),
    ]);
  }
  for (const { type, entries } of site.custom) {
    section(type.plural, [
      ...(type.archive_enabled ? [line(`All ${type.plural.toLowerCase()}`, type.path, type.description)] : []),
      ...entries.map((x) => line(x.title, x.path, x.summary)),
    ]);
  }
  section("Company", [
    line("About", "/about"),
    line("Team", "/team"),
    line("Clients", "/clients"),
    line("Certifications", "/certifications"),
    line("Careers", "/careers"),
  ]);
  return out.join("\n");
}

/** "Thursday 12 November 2026, 3:00 pm – 4:30 pm IST — In person and online, Experience Centre, Mumbai. …" */
function eventLine(event: EventSummary): string {
  const place = [event.venue_name, event.venue_city].filter(Boolean).join(", ");
  const where = [event.format_label, place].filter(Boolean).join(", ");
  return [`${event.date_label}, ${event.time_label} — ${where}.`, event.summary].filter(Boolean).join(" ");
}

/** An event's agenda as a list under its own heading, or nothing. */
function agendaLines(agenda: EventAgendaItem[]): string {
  if (agenda.length === 0) return "";
  const rows = agenda.map((a) => `- ${[a.time, a.title].filter(Boolean).join(" — ")}${a.note ? `: ${oneLine(a.note)}` : ""}`);
  return ["## Agenda", "", ...rows].join("\n");
}

/** `/llms.txt`: the index. */
export async function llmsIndex(): Promise<string> {
  const site = await load();
  return [head(site), index(site), `Full text: ${url("/llms-full.txt")}`, ""].join("\n");
}

/**
 * `/llms-full.txt`: the index, then the text of every solution, service,
 * knowledge article, case study and recent post. Each body is one detail
 * fetch, ISR-cached like the pages themselves, so the second build of this
 * file costs nothing the site was not already paying.
 */
export async function llmsFull(): Promise<string> {
  const site = await load();
  const quiet = async <T,>(p: Promise<{ data: T }>): Promise<T | null> => p.then((r) => r.data).catch(() => null);

  const [solutions, services, articles, caseStudies, posts] = await Promise.all([
    Promise.all(site.solutions.map((x) => quiet(publicApi.solution(x.slug)))),
    Promise.all(site.services.map((x) => quiet(publicApi.service(x.slug)))),
    Promise.all(site.articles.map((x) => quiet(publicApi.knowledgeArticle(x.slug)))),
    Promise.all(site.caseStudies.map((x) => quiet(publicApi.caseStudy(x.slug)))),
    Promise.all(site.posts.map((x) => quiet(publicApi.post(x.slug)))),
  ]);

  const out: string[] = [head(site), index(site), "---", ""];
  const doc = (title: string, path: string, parts: (string | null | undefined)[]) => {
    const body = parts.map((p) => text(p)).filter(Boolean).join("\n\n");
    if (!body) return;
    out.push(`# ${title}`, "", `Source: ${url(path)}`, "", body, "", "---", "");
  };

  // The definition goes straight after the summary — it is the one-sentence
  // answer to "what is it", written to be quoted — and the questions close
  // the record, the FAQs first and the `question` blocks after them, the
  // order `faq_schema` lists them in. The other kinds are drawn on the page
  // and left out here: an assistant wants the definition and the questions,
  // and the body already carries the rest.
  for (const s of solutions) if (s) doc(s.title, `/solutions/${s.slug}`, [s.summary, definition(s), s.problem_statement, s.overview, (s.benefits ?? []).map((b) => `- ${b}`).join("\n"), questions(s)]);
  for (const s of services) if (s) doc(s.title, `/services/${s.slug}`, [s.summary, definition(s), s.body, questions(s)]);
  for (const a of articles) if (a) doc(a.title, `/knowledge-base/${a.slug}`, [a.excerpt, definition(a), a.body, questions(a)]);
  for (const c of caseStudies) if (c) doc(c.title, `/case-studies/${c.slug}`, [c.summary, (c.results ?? []).map((r) => `- ${r.value} — ${r.label}`).join("\n"), c.body]);
  for (const p of posts) if (p) doc(p.title, `/blog/${p.slug}`, [p.excerpt, definition(p), p.body, questions(p)]);

  // Upcoming events: when and where, then the description, the agenda and
  // the questions. Each is the event page's own cached read.
  const events = await Promise.all(site.events.map((x) => quiet(publicApi.event(x.slug))));
  for (const e of events) {
    if (!e) continue;
    doc(e.title, `/events/${e.slug}`, [
      eventLine(e),
      e.body,
      agendaLines(e.agenda),
      questions(e),
    ]);
  }

  // Custom content: each entry's own read, ISR-cached like its page.
  for (const { type, entries } of site.custom) {
    const full = await Promise.all(entries.map((x) => quiet(publicApi.entry(type.slug, x.slug))));
    for (const e of full) if (e) doc(e.title, e.path, [e.summary, definition(e), e.body, questions(e)]);
  }

  return out.join("\n");
}

type Answering = { answer_blocks?: PublicAnswerBlock[]; faqs?: Faq[] };

/** The record's `definition` blocks: the direct answer, then the explanation. */
function definition(r: Answering): string {
  return (r.answer_blocks ?? [])
    .filter((b) => b.kind === "definition" && b.answer.trim())
    .map((b) => [b.answer.trim(), text(b.detail)].filter(Boolean).join("\n\n"))
    .join("\n\n");
}

/** The record's questions — the FAQs and the `question` blocks — as a section, or nothing. */
function questions(r: Answering): string {
  const rows = [
    ...(r.faqs ?? []).map((f) => ({ q: f.question, a: text(f.answer) })),
    ...(r.answer_blocks ?? [])
      .filter((b) => b.kind === "question" && b.question?.trim() && b.answer.trim())
      .map((b) => ({ q: b.question!.trim(), a: [b.answer.trim(), text(b.detail)].filter(Boolean).join(" ") })),
  ].filter((row) => row.q.trim() && row.a.trim());
  if (rows.length === 0) return "";
  return ["## Questions", ...rows.map((row) => `**${row.q}**\n\n${row.a}`)].join("\n\n");
}
