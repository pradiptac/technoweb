/**
 * The parts a theme's header and footer are made of, and how a stored choice
 * about them resolves (0.160.0).
 *
 * A theme still draws its own chrome — the markup, the breakpoints and the
 * widths at which a piece appears are the theme's. What an editor decides is
 * which of the pieces *that theme draws* show, and, where the theme can
 * rearrange them, in what order, plus the words and the link on its buttons.
 * So each manifest declares a `ChromeSupport`: the ids it draws, the groups it
 * can reorder, and the ones it draws off until asked. The defaults are
 * therefore the theme's chrome exactly as it was before this existed: with no
 * stored row every supported part is on (bar `off`), nothing moves, and a
 * button keeps the theme's own words.
 *
 * Pure data and pure functions, safe on either side of the boundary, like
 * `options.ts` — the console imports the lists to draw its controls, the
 * server-side `resolveChrome()` hands each header and footer their answer.
 * The API (`App\Support\ThemeOptions`) checks the stored row's shape and the
 * ids it may name (`HEADER_PARTS`/`FOOTER_PARTS`); which ids a given theme
 * draws is a fact about its markup and lives here.
 */

export const HEADER_PART_IDS = ["topbar", "phone", "email", "search", "utility", "cta", "cta2", "cart", "scheme"] as const;
export const FOOTER_PART_IDS = ["brand", "tagline", "address", "phone", "social", "columns", "signup", "legal", "credit", "scheme"] as const;
export type HeaderPartId = (typeof HEADER_PART_IDS)[number];
export type FooterPartId = (typeof FOOTER_PART_IDS)[number];

export type PartInfo = { label: string; blurb: string };

export const HEADER_PARTS: Record<HeaderPartId, PartInfo> = {
  topbar: { label: "Top bar", blurb: "The strip above the header, with the contact details, search and utility links." },
  phone: { label: "Phone number", blurb: "The telephone number or call button." },
  email: { label: "Email address", blurb: "The support email address." },
  search: { label: "Search", blurb: "The search field." },
  utility: { label: "Utility links", blurb: "The top bar's links, such as Customer login." },
  cta: { label: "Main button", blurb: "The header's call to action." },
  cta2: { label: "Second button", blurb: "A quieter button beside the main one." },
  cart: { label: "Basket count", blurb: "The basket mark on the Store link." },
  scheme: { label: "Light / dark switch", blurb: "Lets visitors choose the colour scheme from the header. Off unless you switch it on." },
};

export const FOOTER_PARTS: Record<FooterPartId, PartInfo> = {
  brand: { label: "Logo", blurb: "The company logo or name." },
  tagline: { label: "Tagline", blurb: "The line under the logo." },
  address: { label: "Address", blurb: "The postal address." },
  phone: { label: "Phone number", blurb: "The telephone number." },
  social: { label: "Social links", blurb: "The social profile icons." },
  columns: { label: "Menu columns", blurb: "The link columns, from the footer menu." },
  signup: { label: "Newsletter signup", blurb: "The signup form, when the newsletter is switched on." },
  legal: { label: "Policy links", blurb: "Privacy, terms and the other links along the bottom." },
  credit: { label: "Credit line", blurb: "The copyright line." },
  scheme: { label: "Light / dark switch", blurb: "The colour scheme control." },
};

/** What one side (header or footer) of one theme draws. */
export type ChromeSide<Id extends string> = {
  /** Every part the theme draws, in the order it draws them. */
  parts: readonly Id[];
  /**
   * Sets of parts the theme can put in any order *among themselves* — the
   * members of one row or one block. The listed order is the theme's own.
   */
  groups?: readonly (readonly Id[])[];
  /** Parts the theme draws only when asked: off in the default. */
  off?: readonly Id[];
};

export type ChromeSupport = {
  header: ChromeSide<HeaderPartId>;
  footer: ChromeSide<FooterPartId>;
};

/** A header button as stored: any of its words, its link and its switch. */
export type StoredButton = { label?: string; href?: string; on?: boolean };

export type StoredChrome<Id extends string> = {
  /** Only the switches that differ from the theme's default are meaningful, but any are accepted. */
  parts: Partial<Record<Id, boolean>>;
  order: Id[];
};
export type StoredHeader = StoredChrome<HeaderPartId> & { cta?: StoredButton; cta2?: StoredButton };
export type StoredFooter = StoredChrome<FooterPartId>;

export type ChromeOptions = { header: StoredHeader; footer: StoredFooter };

export type ResolvedChrome<Id extends string> = {
  /** Every id, drawn or not; an id the theme does not draw is false. */
  show: Record<Id, boolean>;
  /** The groups' members in the order to draw them, flattened. */
  order: Id[];
};
export type ResolvedHeader = ResolvedChrome<HeaderPartId> & {
  /** The button's own words and link; absent means the theme's. */
  cta: { label?: string; href?: string };
  cta2: { label?: string; href?: string };
};
export type ResolvedFooter = ResolvedChrome<FooterPartId>;

const LABEL_MAX = 30;
const HREF = /^(\/(?![/\\])[^\s]*|https?:\/\/[^\s]+|mailto:[^\s]+|tel:[^\s]+)$/i;

function parseButton(raw: unknown): StoredButton | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: StoredButton = {};
  if (typeof r.label === "string" && r.label.trim() !== "" && r.label.length <= LABEL_MAX) out.label = r.label;
  if (typeof r.href === "string" && HREF.test(r.href)) out.href = r.href;
  if (typeof r.on === "boolean") out.on = r.on;
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseSide<Id extends string>(raw: unknown, ids: readonly Id[], skip: readonly string[] = []): StoredChrome<Id> {
  const parts: Partial<Record<Id, boolean>> = {};
  const order: Id[] = [];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    if (r.parts && typeof r.parts === "object" && !Array.isArray(r.parts)) {
      for (const [id, row] of Object.entries(r.parts as Record<string, unknown>)) {
        const on = row && typeof row === "object" ? (row as Record<string, unknown>).on : undefined;
        if ((ids as readonly string[]).includes(id) && !skip.includes(id) && typeof on === "boolean") parts[id as Id] = on;
      }
    }
    if (Array.isArray(r.order)) {
      for (const id of r.order) {
        if (typeof id === "string" && (ids as readonly string[]).includes(id) && !order.includes(id as Id)) order.push(id as Id);
      }
    }
  }
  return { parts, order };
}

/** The stored `header`/`footer` objects of one theme, defensively: anything not the shape it should be is as if absent. */
export function parseChrome(rawHeader: unknown, rawFooter: unknown): ChromeOptions {
  const header: StoredHeader = parseSide(rawHeader, HEADER_PART_IDS, ["cta", "cta2"]);
  if (rawHeader && typeof rawHeader === "object" && !Array.isArray(rawHeader)) {
    const r = rawHeader as Record<string, unknown>;
    const cta = parseButton(r.cta);
    const cta2 = parseButton(r.cta2);
    if (cta) header.cta = cta;
    if (cta2) header.cta2 = cta2;
  }
  return { header, footer: parseSide(rawFooter, FOOTER_PART_IDS) };
}

function resolveSide<Id extends string>(
  ids: readonly Id[], side: ChromeSide<Id>, stored: StoredChrome<Id>, switches: Partial<Record<Id, boolean>> = {},
): ResolvedChrome<Id> {
  const show = {} as Record<Id, boolean>;
  for (const id of ids) {
    const drawn = side.parts.includes(id);
    show[id] = drawn && (switches[id] ?? stored.parts[id] ?? !side.off?.includes(id));
  }
  const rank = (id: Id) => {
    const i = stored.order.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  // Each group sorted by the stored order, stably: members the row does not
  // name keep the theme's own place after the ones it does.
  const order = (side.groups ?? []).flatMap((g) => [...g].sort((a, b) => rank(a) - rank(b)));
  return { show, order };
}

/** What a header draws, from the manifest's support and the stored choices. */
export function resolveHeader(support: ChromeSide<HeaderPartId>, stored: StoredHeader): ResolvedHeader {
  const base = resolveSide(HEADER_PART_IDS, support, stored, { cta: stored.cta?.on, cta2: stored.cta2?.on });
  return {
    ...base,
    cta: { label: stored.cta?.label, href: stored.cta?.href },
    cta2: { label: stored.cta2?.label, href: stored.cta2?.href },
  };
}

export function resolveFooter(support: ChromeSide<FooterPartId>, stored: StoredFooter): ResolvedFooter {
  return resolveSide(FOOTER_PART_IDS, support, stored);
}

/**
 * Nodes keyed by part id, in the theme's own order unless the stored order
 * says otherwise, with the parts switched off left out. The caller writes the
 * nodes in the order the theme draws them, so the default is the markup it
 * always rendered.
 */
export function arrange<Id extends string, T>(chrome: ResolvedChrome<Id>, nodes: readonly [Id, T][]): [Id, T][] {
  const rank = (id: Id) => {
    const i = chrome.order.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return nodes
    .map((n, at) => ({ n, at }))
    .filter(({ n }) => chrome.show[n[0]])
    .sort((a, b) => rank(a.n[0]) - rank(b.n[0]) || a.at - b.at)
    .map(({ n }) => [n[0], n[1]] as [Id, T]);
}

/** Header and footer as they are with nothing stored, for a caller that has no options to read (the 404 page). */
export function defaultHeader(support: ChromeSide<HeaderPartId>): ResolvedHeader {
  return resolveHeader(support, { parts: {}, order: [] });
}

/* ------------------------------------------------- what the themes draw */

/** Classic's header — also Enterprise's, Horizon's and Canvas's, which inherit it. */
export const CLASSIC_HEADER: ChromeSide<HeaderPartId> = {
  parts: ["topbar", "phone", "email", "search", "utility", "cta", "cta2", "cart", "scheme"],
  groups: [["phone", "email"], ["search", "utility"], ["cta2", "cta"]],
  off: ["scheme"],
};

/**
 * The one-row headers (a bar with the logo, the sections and a cluster of
 * tools on the right). `tools` is the order that cluster draws them in.
 */
export function oneRowHeader(tools: readonly ("utility" | "search" | "phone" | "cta")[]): ChromeSide<HeaderPartId> {
  return { parts: [...tools, "cart", "scheme"], groups: [tools], off: ["scheme"] };
}

/** A footer whose brand block (logo, tagline, address and number, social) is `Brand`: its tagline, address and social row can swap places. */
export const BRAND_FOOTER: ChromeSide<FooterPartId> = {
  parts: ["brand", "tagline", "address", "phone", "social", "columns", "signup", "legal", "credit", "scheme"],
  groups: [["tagline", "address", "social"]],
};

/** A footer that composes its own brand block, so nothing in it moves. */
export const FIXED_FOOTER: ChromeSide<FooterPartId> = {
  parts: ["brand", "tagline", "address", "phone", "social", "columns", "signup", "legal", "credit", "scheme"],
};
