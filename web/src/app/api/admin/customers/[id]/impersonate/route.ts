import { NextResponse, type NextRequest } from "next/server";

import { ApiError } from "@/lib/api";
import { impersonateCustomer } from "@/lib/admin";
import { getToken } from "@/lib/admin-auth";
import { IMPERSONATION_COOKIE } from "@/lib/auth";

/**
 * "View as": open the customer portal as one customer, in a new tab.
 *
 * A route handler rather than a Server Action, because the outcome is a
 * *response* — a `tw_session` cookie and a redirect to `/portal` — that a new
 * tab has to receive, and an action returns a value, not a response a
 * browser will save. The console opens it with
 * `<form method="post" target="_blank">`, which is what gives it the tab.
 *
 * **POST only, and that is the CSRF defence.** Both session cookies are
 * `sameSite: "lax"`. A lax cookie is sent on a cross-site *top-level GET*
 * and withheld on a cross-site POST — so were this a GET, a link in a
 * phishing mail opened by a signed-in engineer would arrive with the admin
 * cookie and mint a portal token for whichever customer the URL named. As a
 * POST the same attempt arrives with no cookie and is refused before
 * anything is minted. The `Origin` check underneath is belt and braces: a
 * browser sends the header on every form POST, and one naming a different
 * host is refused even if a cookie somehow came with it. The host is read
 * the way `proxy.ts` reads it, `x-forwarded-host` first, so Plesk's
 * internal address does not fail every legitimate press.
 *
 * A refusal answers as a small page rather than JSON: whatever comes back
 * is what the new tab shows.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && originHost(origin) !== requestHost(request)) {
    return page(403, "This request did not come from the console.");
  }

  const token = await getToken();
  if (!token) return page(401, "Sign in to the console first.");

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return page(404, "No such customer.");

  let minted;
  try {
    minted = await impersonateCustomer(id);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422 || error.status === 403) return page(error.status, error.message);
      if (error.status === 404) return page(404, "No such customer.");
    }
    return page(502, "The API could not be reached. Nothing has been changed.");
  }

  // 303, so the new tab lands on the portal with a GET whatever it was
  // opened with, and the cookie rides on the redirect itself.
  const response = NextResponse.redirect(new URL("/portal", request.url), 303);
  response.cookies.set(IMPERSONATION_COOKIE.name, minted.token, IMPERSONATION_COOKIE.options());
  return response;
}

function requestHost(request: NextRequest): string | null {
  const raw = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return raw?.split(",")[0]?.trim().toLowerCase() || null;
}

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * A refusal the tab can show. Escaped by hand — the sentence is the API's own
 * and a customer's status label sits inside it. No colours and no script: the
 * browser's own defaults are enough for one sentence, and a `javascript:` link
 * is exactly what the site's CSP refuses.
 */
function page(status: number, sentence: string) {
  const escaped = sentence.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Could not open the portal</title>`
    + `<meta name="robots" content="noindex"></head>`
    + `<body style="font:16px/1.5 system-ui,sans-serif;margin:0;padding:48px 24px">`
    + `<h1 style="font-size:20px;margin:0 0 12px">Could not open the portal</h1><p>${escaped}</p>`
    + `<p>Close this tab and try again from the console.</p></body></html>`;

  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
