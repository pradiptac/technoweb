/**
 * Which manual sections the console's help drawer shows for a screen
 * (docs/help-and-tours.md). The most specific matching prefix wins — the
 * sidebar's longest-match rule — and `*` stands for one path segment (a
 * record's id or reference). A screen nobody listed falls back to its area's
 * chapter, so every screen shows something.
 *
 * scripts/help-routes.check.mjs fails when an id here is not in help.json,
 * so a renamed manual heading is caught, not shipped as an empty drawer.
 * No directive: the route handler and the self-check both import it.
 */
export const HELP_ROUTES: { prefix: string; sections: string[] }[] = [
  { prefix: "/admin", sections: ["08-tickets#the-dashboard", "04-first-steps#overview"] },
  { prefix: "/admin/profile", sections: ["17-users-and-roles#your-account", "17-users-and-roles#signing-in-codes-and-passwords"] },

  { prefix: "/admin/tickets", sections: ["08-tickets#the-ticket-queue", "08-tickets#saved-replies"] },
  { prefix: "/admin/tickets/*", sections: ["08-tickets#working-a-ticket", "08-tickets#merging-tickets", "08-tickets#saved-replies"] },
  { prefix: "/admin/tickets/settings", sections: ["08-tickets#email-to-ticket", "08-tickets#the-satisfaction-survey"] },
  { prefix: "/admin/tickets/canned-replies", sections: ["08-tickets#saved-replies"] },
  { prefix: "/admin/customers", sections: ["09-customers#the-approval-queue", "09-customers#account-statuses", "09-customers#managing-an-account"] },
  { prefix: "/admin/customers/*", sections: ["09-customers#managing-an-account", "09-customers#view-as", "09-customers#addresses-and-gstin"] },
  { prefix: "/admin/leads", sections: ["10-leads-and-visits#the-lead-pipeline"] },
  { prefix: "/admin/visits", sections: ["10-leads-and-visits#engineer-visit-requests"] },
  { prefix: "/admin/meetings", sections: ["10-leads-and-visits#online-meetings"] },
  { prefix: "/admin/my-meetings", sections: ["10-leads-and-visits#online-meetings"] },

  { prefix: "/admin/pages", sections: ["05-content#pages", "05-content#how-every-edit-form-works", "05-content#sharing-a-draft"] },
  { prefix: "/admin/blog", sections: ["05-content#the-blog", "05-content#how-every-edit-form-works"] },
  { prefix: "/admin/blog-categories", sections: ["05-content#the-blog"] },
  { prefix: "/admin/blog-comments", sections: ["05-content#the-blog"] },
  { prefix: "/admin/knowledge-base", sections: ["05-content#knowledge-base"] },
  { prefix: "/admin/case-studies", sections: ["05-content#case-studies"] },
  { prefix: "/admin/faqs", sections: ["05-content#faqs"] },
  { prefix: "/admin/health", sections: ["31-site-health#reading-the-list", "31-site-health#ignore-and-recheck"] },
  { prefix: "/admin/health/settings", sections: ["31-site-health#the-settings-administrators"] },
  { prefix: "/admin/blocks", sections: ["05-content#content-blocks"] },
  { prefix: "/admin/menus", sections: ["05-content#menus"] },
  { prefix: "/admin/popups", sections: ["05-content#popups"] },
  { prefix: "/admin/sliders", sections: ["05-content#sliders-and-galleries"] },
  { prefix: "/admin/galleries", sections: ["05-content#sliders-and-galleries"] },
  { prefix: "/admin/forms", sections: ["05-content#forms"] },
  { prefix: "/admin/custom-fields", sections: ["05-content#custom-fields"] },
  { prefix: "/admin/content-types", sections: ["05-content#custom-content-types"] },
  { prefix: "/admin/content", sections: ["05-content#custom-content-types"] },
  { prefix: "/admin/detail-templates", sections: ["05-content#pages"] },

  { prefix: "/admin/solutions", sections: ["06-catalogue#solutions", "06-catalogue#what-the-forms-have-in-common"] },
  { prefix: "/admin/services", sections: ["06-catalogue#services", "06-catalogue#what-the-forms-have-in-common"] },
  { prefix: "/admin/service-categories", sections: ["06-catalogue#services"] },
  { prefix: "/admin/industries", sections: ["06-catalogue#industries"] },
  { prefix: "/admin/product-categories", sections: ["06-catalogue#product-categories"] },
  { prefix: "/admin/products", sections: ["06-catalogue#products"] },
  { prefix: "/admin/brands", sections: ["06-catalogue#brands"] },
  { prefix: "/admin/team-members", sections: ["06-catalogue#the-company-profile"] },
  { prefix: "/admin/clients", sections: ["06-catalogue#the-company-profile"] },
  { prefix: "/admin/certifications", sections: ["06-catalogue#the-company-profile"] },
  { prefix: "/admin/landing-pages", sections: ["06-catalogue#landing-pages"] },
  { prefix: "/admin/locations", sections: ["06-catalogue#places"] },
  { prefix: "/admin/support-centres", sections: ["28-support-network#adding-a-centre", "28-support-network#staff-and-centres"] },

  { prefix: "/admin/store", sections: ["07-store#overview-stock-and-reports", "07-store#opening-the-shop"] },
  { prefix: "/admin/store/orders", sections: ["07-store#orders", "07-store#nothing-marks-an-order-paid-except-a-recorded-payment"] },
  { prefix: "/admin/store/orders/*", sections: ["07-store#orders", "07-store#refunds", "07-store#booking-parcels-with-shiprocket"] },
  { prefix: "/admin/store/products", sections: ["07-store#products", "07-store#feeds-for-google-and-meta"] },
  { prefix: "/admin/store/categories", sections: ["07-store#categories-and-filters"] },
  { prefix: "/admin/store/coupons", sections: ["07-store#discount-codes"] },
  { prefix: "/admin/store/returns", sections: ["07-store#returns"] },
  { prefix: "/admin/store/reviews", sections: ["07-store#reviews"] },
  { prefix: "/admin/store/invoicing", sections: ["07-store#tax-and-invoicing", "07-store#orders"] },
  { prefix: "/admin/store/promo", sections: ["07-store#promo-banners"] },
  { prefix: "/admin/store/videos", sections: ["07-store#product-videos"] },
  { prefix: "/admin/store/tags", sections: ["07-store#tags"] },
  { prefix: "/admin/store/shipping", sections: ["07-store#shipping-what-delivery-costs"] },
  { prefix: "/admin/store/stock", sections: ["07-store#overview-stock-and-reports"] },
  { prefix: "/admin/store/reports", sections: ["07-store#overview-stock-and-reports"] },
  { prefix: "/admin/store/settings", sections: ["07-store#opening-the-shop", "07-store#ways-to-pay", "07-store#invoices-from-zoho-books"] },

  { prefix: "/admin/newsletter", sections: ["11-newsletter#before-your-first-campaign", "11-newsletter#campaigns"] },
  { prefix: "/admin/newsletter/subscribers", sections: ["11-newsletter#subscribers", "11-newsletter#verification-with-hunter"] },
  { prefix: "/admin/newsletter/groups", sections: ["11-newsletter#groups"] },
  { prefix: "/admin/newsletter/campaigns", sections: ["11-newsletter#campaigns"] },
  { prefix: "/admin/newsletter/sequences", sections: ["11-newsletter#sequences"] },
  { prefix: "/admin/newsletter/templates", sections: ["11-newsletter#templates"] },
  { prefix: "/admin/newsletter/unsubscribes", sections: ["11-newsletter#unsubscribes-and-the-do-not-mail-list"] },
  { prefix: "/admin/newsletter/verification", sections: ["11-newsletter#verification-with-hunter"] },
  { prefix: "/admin/messaging", sections: ["12-messaging#overview", "12-messaging#consent-comes-only-from-the-customer"] },

  { prefix: "/admin/seo", sections: ["13-seo#the-overview-and-the-three-scores", "13-seo#the-ai-seo-assistant"] },
  { prefix: "/admin/redirects", sections: ["13-seo#redirects"] },
  { prefix: "/admin/not-found", sections: ["13-seo#missing-pages"] },
  { prefix: "/admin/media", sections: ["14-media#uploading", "14-media#working-with-a-file", "14-media#the-bin"] },
  { prefix: "/admin/chat", sections: ["16-assistant#the-overview", "16-assistant#unanswered-questions", "16-assistant#conversations"] },
  { prefix: "/admin/chat/settings", sections: ["16-assistant#settings", "15-appearance#the-chat-assistant-s-look"] },

  { prefix: "/admin/themes", sections: ["15-appearance#site-themes", "15-appearance#colour-palette-and-fonts"] },
  { prefix: "/admin/site", sections: ["15-appearance#site-themes"] },
  { prefix: "/admin/info-bar", sections: ["15-appearance#the-info-bar"] },
  { prefix: "/admin/settings", sections: ["18-settings#general", "18-settings#contact", "18-settings#homepage", "32-semantic-search#switching-it-on"] },
  { prefix: "/admin/settings/email-templates", sections: ["18-settings#email-templates"] },
  { prefix: "/admin/webhooks", sections: ["18-settings#webhooks"] },
  { prefix: "/admin/users", sections: ["17-users-and-roles#managing-staff", "17-users-and-roles#the-roles"] },
  { prefix: "/admin/activity", sections: ["17-users-and-roles#the-activity-log"] },
  { prefix: "/admin/client-errors", sections: ["17-users-and-roles#javascript-errors"] },

  { prefix: "/admin/jobs", sections: ["19-careers#vacancies"] },
  { prefix: "/admin/applications", sections: ["19-careers#applications", "19-careers#how-long-cvs-are-kept"] },
  { prefix: "/admin/events", sections: ["24-events#adding-an-event", "24-events#registration"] },
  { prefix: "/admin/tenders", sections: ["29-tenders#posting-a-tender", "29-tenders#the-documents"] },
  { prefix: "/admin/events/*/registrations", sections: ["24-events#registrations", "24-events#changing-an-event-after-people-have-registered"] },
  { prefix: "/admin/downloads", sections: ["26-downloads#adding-a-download", "26-downloads#categories"] },

  { prefix: "/admin/backups", sections: ["22-backups-and-restore#setting-it-up", "22-backups-and-restore#restoring"] },
  { prefix: "/admin/system/updates", sections: ["21-updating#applying-an-update", "21-updating#if-it-stops-part-way", "21-updating#going-back-rollback"] },
  { prefix: "/admin/system/status", sections: ["04-first-steps#9-check-the-status", "23-troubleshooting#the-scheduler-is-not-running", "23-troubleshooting#the-site-feels-slow"] },
  { prefix: "/admin/imports/wordpress", sections: ["20-importing-wordpress#running-the-import", "20-importing-wordpress#what-comes-across"] },
  { prefix: "/admin/imports/site", sections: ["27-importing-a-website#running-the-import", "27-importing-a-website#what-comes-across"] },
];

/** The fallback: a screen nobody listed shows its area's chapter. */
export const CHAPTER_FOR_PREFIX: { prefix: string; chapter: string }[] = [
  { prefix: "/admin/store", chapter: "07-store" },
  { prefix: "/admin/newsletter", chapter: "11-newsletter" },
  { prefix: "/admin/messaging", chapter: "12-messaging" },
  { prefix: "/admin/system", chapter: "23-troubleshooting" },
  { prefix: "/admin/imports", chapter: "20-importing-wordpress" },
  { prefix: "/admin/settings", chapter: "18-settings" },
  { prefix: "/admin", chapter: "04-first-steps" },
];

/** How well a pattern matches: -1 for no match, otherwise its literal length. */
function score(pattern: string, path: string): number {
  const want = pattern.split("/");
  const got = path.split("/");
  if (got.length < want.length) return -1;
  let literal = 0;
  for (let i = 0; i < want.length; i++) {
    if (want[i] === "*") continue;
    if (want[i] !== got[i]) return -1;
    literal += want[i]!.length + 1;
  }
  // A longer exact pattern beats a wildcard of the same shape.
  return literal * 10 + want.length;
}

function best<T extends { prefix: string }>(rows: T[], path: string): T | undefined {
  let top: T | undefined;
  let topScore = -1;
  for (const r of rows) {
    const s = score(r.prefix, path);
    if (s > topScore) { top = r; topScore = s; }
  }
  return top;
}

export function helpIdsFor(path: string, all: { id: string; chapter: string }[]): string[] {
  const clean = path.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/admin";
  const hit = best(HELP_ROUTES, clean);
  // The bare /admin row is the dashboard's, not a catch-all for every screen.
  // Only ids help.json still has: a heading renamed in the manual must fall
  // back to the chapter, never empty the drawer.
  const known = new Set(all.map((s) => s.id));
  const listed = hit && (hit.prefix !== "/admin" || clean === "/admin") ? hit.sections.filter((id) => known.has(id)) : [];
  if (listed.length) return listed;
  // Listed, but every id has gone: the chapter those ids were in.
  const gone = hit && hit.sections[0] ? hit.sections[0].split("#")[0] : null;
  if (gone && all.some((s) => s.chapter === gone)) return all.filter((s) => s.chapter === gone).slice(0, 3).map((s) => s.id);
  const area = best(CHAPTER_FOR_PREFIX, clean);
  return area ? all.filter((s) => s.chapter === area.chapter).slice(0, 3).map((s) => s.id) : [];
}
