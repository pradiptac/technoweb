import { NextResponse } from "next/server";

import { getToken } from "@/lib/admin-auth";
import { proxyMultipart } from "@/lib/proxy-upload";

/**
 * The media library's upload, as a route handler the browser can watch.
 *
 * Every upload in the console used to be a Server Action, and a Server Action
 * gives the browser no progress events at all — so the bar counted files and
 * said so, because a percentage animated on a timer is worse than none. What
 * byte progress needs is `XMLHttpRequest.upload.onprogress`, and that needs a
 * URL to post to that is not an action: this one. `lib/media-upload.ts` is
 * the client half; `proxyMultipart` streams the body through untouched.
 *
 * The session check is the same one every admin action makes; without a
 * token this answers 401 with a sentence rather than forwarding an
 * unauthenticated upload for the API to refuse.
 */
export async function POST(request: Request) {
  const token = await getToken();

  if (!token) {
    return NextResponse.json({ message: "Your session has expired. Reload the page and sign in again." }, { status: 401 });
  }

  return proxyMultipart(request, "/admin/media", { token });
}
