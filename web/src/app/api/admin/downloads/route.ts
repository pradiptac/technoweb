import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/admin-auth";
import { proxyMultipart } from "@/lib/proxy-upload";

/**
 * A new download that arrives with its file (docs/downloads.md).
 *
 * The same `POST /admin/downloads` the Server Action calls, streamed through
 * `proxyMultipart` so a firmware image going up shows a real percentage. The
 * file lands on the API's private disk and comes back only through the
 * routes that hand a download out.
 */
export async function POST(request: NextRequest) {
  const token = await getToken();

  if (!token) {
    return NextResponse.json({ message: "Your session has expired. Reload the page and sign in again." }, { status: 401 });
  }

  return proxyMultipart(request, "/admin/downloads", { token });
}
