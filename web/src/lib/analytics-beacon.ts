/*
 * The beacon's pure rules (C3, docs/analytics.md): which pages are counted,
 * which link is which kind of click, and the UTM tags. No directive: the
 * check script imports it under Node.
 */

/** Never counted: the console, the portal, the API, and every page a secret addresses. Mirrors Collector::EXCLUDED. */
export const NEVER = ["/admin", "/portal", "/api", "/_next", "/order/", "/newsletter/unsubscribe/", "/newsletter/rejoin/",
  "/store/notify/cancel/", "/store/wishlist/stop/", "/store/basket/restore/", "/meeting/", "/visit/", "/ticket-survey/",
  "/events/registration/", "/preview/"];

export function collectable(path: string): boolean {
  return !NEVER.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p.endsWith("/") ? p : `${p}/`));
}

const FILES = /\.(pdf|zip|docx?|xlsx?|pptx?|csv|txt|dmg|exe|msi|apk|bin|iso|tar|gz|rar|7z)$/i;

export function linkKind(href: string, origin: string): "outbound" | "download" | "contact" | null {
  if (/^(tel|mailto):/i.test(href)) return "contact";
  let url: URL;
  try { url = new URL(href, origin); } catch { return null; }
  if (/(^|\.)wa\.me$|(^|\.)whatsapp\.com$/i.test(url.hostname)) return "contact";
  const own = new URL(origin).hostname.replace(/^www\./, "");
  if (url.hostname.replace(/^www\./, "") !== own) return url.protocol.startsWith("http") ? "outbound" : null;
  if (url.pathname.startsWith("/api/downloads/") || FILES.test(url.pathname)) return "download";
  return null;
}

export function utmFrom(search: string): { source?: string; medium?: string; campaign?: string } {
  const q = new URLSearchParams(search);
  const out: { source?: string; medium?: string; campaign?: string } = {};
  for (const k of ["source", "medium", "campaign"] as const) {
    const v = q.get(`utm_${k}`)?.trim();
    if (v) out[k] = v.slice(0, 100);
  }
  return out;
}
