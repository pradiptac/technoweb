import { NextResponse } from "next/server";

import { getToken } from "@/lib/auth";
import { proxyMultipart } from "@/lib/proxy-upload";

/**
 * Raise a ticket, with attachments, as a request the browser can watch.
 *
 * The portal's new-ticket form posts here when it carries files, so the bar
 * under the attachments shows how far five screenshots have got rather than a
 * spinner; without files it still goes through its Server Action. Same
 * session, same API endpoint (`POST /tickets`), same answer — only who sends
 * the bytes changed. See `lib/use-upload-form.ts`.
 */
export async function POST(request: Request) {
  const token = await getToken();

  if (!token) {
    return NextResponse.json({ message: "Your session has expired. Sign in again." }, { status: 401 });
  }

  return proxyMultipart(request, "/tickets", { token });
}
