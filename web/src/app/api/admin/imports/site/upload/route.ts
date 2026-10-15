import { NextResponse } from "next/server";

import { getToken } from "@/lib/admin-auth";
import { proxyMultipart } from "@/lib/proxy-upload";

/**
 * One chunk of a website's ZIP, on its way to the import's private folder.
 *
 * The same route handler the release zip uses (`system/updates/upload`), for
 * the same reasons: shared hosting accepts a couple of megabytes per request,
 * so the Site import screen slices the file (`chunk_bytes`, from the API) and
 * posts the pieces in order here; `proxyMultipart` streams each one through
 * untouched, with the same Origin check and session every console upload has.
 */
export async function POST(request: Request) {
  const token = await getToken();

  if (!token) {
    return NextResponse.json({ message: "Your session has expired. Reload the page and sign in again." }, { status: 401 });
  }

  return proxyMultipart(request, "/admin/imports/site/upload", { token });
}
