/**
 * The guided tours (docs/help-and-tours.md): a few steps on the screens a new
 * person meets first. A step's `target` is a CSS selector — an existing
 * stable hook where the screen has one (`data-hero-band`, the tick column,
 * `aria-keyshortcuts`), a `data-tour` attribute where it had none. A step
 * whose target is missing or hidden is skipped, so a role without a control,
 * an empty list or a closed panel simply shows one step fewer, and a tour
 * with nothing visible does not start.
 *
 * No directive: the help route reads `tourFor` on the server.
 */
export type TourStep = { target: string; title: string; body: string };
export type TourDef = { match: (path: string, search: URLSearchParams) => boolean; steps: TourStep[] };

export const TOURS: Record<string, TourDef> = {
  dashboard: {
    match: (p) => p === "/admin",
    steps: [
      { target: "[data-hero-band]", title: "What is waiting", body: "One line of what needs you today, with buttons to the lists behind it." },
      { target: '[data-dashboard-row~="glance"]', title: "At a glance", body: "Each tile is a link to the list that produced its number." },
      { target: '[data-tour="customise"]', title: "Make it yours", body: "Hide panels you don't use and put the rest in your own order." },
      { target: '[aria-keyshortcuts="Control+K Meta+K"]', title: "Find anything", body: "Press Ctrl K (⌘ K on a Mac) to jump to any screen, setting or record." },
      { target: '[data-tour="help"]', title: "Help on every screen", body: "Press ? for this screen's part of the manual, and to take a tour again." },
    ],
  },
  tickets: {
    match: (p) => p === "/admin/tickets",
    steps: [
      { target: "form.admin-filters", title: "Narrow the queue", body: "Filter by status, priority or who it's assigned to, or search by reference or subject." },
      { target: '.admin-table tbody tr:first-child td[data-label="Ticket"]', title: "Open a ticket", body: "Press a ticket to read the conversation and reply." },
      { target: ".admin-table thead th:first-child", title: "Act on several", body: "Tick tickets to assign, re-prioritise or close them together." },
      { target: 'button[title="Table view"]', title: "Your columns", body: "Choose the columns you want and how dense the rows are." },
    ],
  },
  builder: {
    // The builder tab is drawn on a page form: the tour waits for its first
    // step, on the Builder tab, and starts when that tab is opened.
    match: (p) => /^\/admin\/pages\/\d+$/.test(p),
    steps: [
      { target: '[data-tour="add-section"]', title: "Add a section", body: "Pick from heroes, features, galleries, forms and more — or apply a whole template." },
      { target: "[data-section-card] button[aria-expanded]", title: "Edit a section", body: "Open a card to change its words, pictures and links, and its Style: spacing, background, how it appears." },
      { target: '[role="toolbar"][aria-label="Builder history"] button[aria-pressed]', title: "See it live", body: "The preview beside the sections redraws as you type." },
      { target: "[data-form-actions] button[type=\"submit\"]", title: "Save", body: "Nothing goes live until you save, and History keeps every version." },
    ],
  },
  media: {
    match: (p) => p === "/admin/media",
    steps: [
      { target: '[data-tour="upload"]', title: "Add files", body: "Drop files anywhere on the page, or press Upload." },
      { target: 'ul[aria-label="Files"] > li:first-child', title: "Work with a file", body: "Select a file to see its details; Shift and Ctrl select several. Open one to edit it — crop, rotate, alt text, focal point." },
    ],
  },
  settings: {
    match: (p) => p === "/admin/settings",
    steps: [
      { target: '[role="tablist"][aria-label="Sections"]', title: "Settings by topic", body: "Each tab is one area: contact details, sign-in, mail, API keys." },
      { target: '[role="tabpanel"]:not([hidden]) :has(> input[role="switch"])', title: "Switches", body: "Slide a switch to turn a feature on or off." },
      { target: '[data-form-actions] button[type="submit"]', title: "Save", body: "Changes apply once saved; most reach the site at once." },
    ],
  },
  portal: {
    match: (p) => p === "/portal",
    steps: [
      { target: '[data-tour="hero-actions"]', title: "Get help fast", body: "Raise a ticket, or book a visit or a meeting." },
      { target: '[data-tour="portal-tiles"]', title: "What's happening", body: "Your open tickets, orders on the way and your next appointment." },
      { target: "#portal-help", title: "Find answers", body: "Search the knowledge base before raising a ticket." },
    ],
  },
};

export function tourFor(path: string, search = ""): string | null {
  const params = new URLSearchParams(search);
  for (const [id, t] of Object.entries(TOURS)) if (t.match(path, params)) return id;
  return null;
}
