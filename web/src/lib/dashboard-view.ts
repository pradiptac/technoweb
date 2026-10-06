/**
 * Which panels the console's dashboard shows one member of staff, and in what
 * order (0.120.0).
 *
 * No directive: the server page arranges with it, the Server Action cleans
 * with it and the dialog draws its list from it — one list of panels, not
 * three.
 *
 * The choice is a **cookie**, not `localStorage` like the table view's. The
 * dashboard is rendered on the server from one API call, so the server has to
 * know the order before it writes a byte: a preference only the browser could
 * read would draw the default and then rearrange it. A cookie also means a
 * hidden panel is not in the markup at all, and the order on screen is the
 * order in the document — which a CSS `order` would not give a keyboard or a
 * screen reader.
 */
export type WidgetKey = "glance" | "kpis" | "volume" | "arrivals" | "status" | "pipeline" | "urgent";
export type GroupKey = "support" | "sales" | "diary" | "content";

export type DashboardView = {
  /** Every panel, in the order to draw them. */
  order: WidgetKey[];
  /** A panel's key, or `glance.<group>` for one group of tiles. */
  hidden: string[];
};

/**
 * In the dashboard's own order — this *is* the default.
 *
 * `half` panels sit two abreast from `lg` when they are neighbours.
 */
export const WIDGETS: { key: WidgetKey; label: string; blurb: string; half?: boolean }[] = [
  { key: "glance", label: "At a glance", blurb: "The tiles: what is open, overdue, new and due today." },
  { key: "kpis", label: "Ticket figures", blurb: "New tickets, first response, time to resolve and the SLA share, over thirty days." },
  { key: "volume", label: "Ticket volume", blurb: "Opened and resolved over time, with what is open by priority and by category." },
  { key: "arrivals", label: "When tickets arrive", blurb: "By weekday and hour." },
  { key: "status", label: "Tickets by status", blurb: "Every ticket, as a ring.", half: true },
  { key: "pipeline", label: "Sales pipeline", blurb: "What happened to the leads that arrived.", half: true },
  { key: "urgent", label: "High priority", blurb: "Critical and high-priority tickets that are open." },
];

export const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "support", label: "Support" },
  { key: "sales", label: "Sales" },
  { key: "diary", label: "Visits and meetings" },
  { key: "content", label: "Content" },
];

const KEYS = WIDGETS.map((w) => w.key);
const HIDEABLE = new Set<string>([...KEYS, ...GROUPS.map((g) => `glance.${g.key}`)]);

export const DEFAULT_VIEW: DashboardView = { order: KEYS, hidden: [] };

/** One cookie per account, so two people sharing a browser keep their own. */
export function dashboardCookie(staffId: number): string {
  return `tw_dashboard_${staffId}`;
}

/**
 * Whatever arrived, as a view this dashboard can draw.
 *
 * An allowlist both ways: a key nobody declared is dropped, and a panel the
 * stored order does not mention — one added in a later release — is appended
 * in its default place among the rest, so it appears rather than vanishing.
 */
export function cleanView(input: unknown): DashboardView {
  const raw = (input && typeof input === "object" ? input : {}) as { order?: unknown; hidden?: unknown };
  const listed = Array.isArray(raw.order) ? raw.order.filter((k): k is WidgetKey => KEYS.includes(k as WidgetKey)) : [];
  const order = [...new Set(listed)];
  for (const key of KEYS) if (!order.includes(key)) order.push(key);

  const hidden = Array.isArray(raw.hidden)
    ? [...new Set(raw.hidden.filter((k): k is string => typeof k === "string" && HIDEABLE.has(k)))]
    : [];

  return { order, hidden };
}

export function parseView(raw: string | undefined): DashboardView {
  if (!raw) return DEFAULT_VIEW;
  try {
    return cleanView(JSON.parse(raw));
  } catch {
    return DEFAULT_VIEW;
  }
}

export function isDefaultView(view: DashboardView): boolean {
  return view.hidden.length === 0 && view.order.every((key, i) => key === KEYS[i]);
}

/**
 * The visible panels as rows: a run of `half` panels shares a row, two to a
 * row; everything else has a row to itself.
 */
export function arrange(view: DashboardView, available: WidgetKey[]): WidgetKey[][] {
  const visible = view.order.filter((key) => available.includes(key) && !view.hidden.includes(key));
  const half = new Set(WIDGETS.filter((w) => w.half).map((w) => w.key));
  const rows: WidgetKey[][] = [];

  for (const key of visible) {
    const last = rows[rows.length - 1];
    if (half.has(key) && last && last.length === 1 && half.has(last[0])) last.push(key);
    else rows.push([key]);
  }

  return rows;
}
