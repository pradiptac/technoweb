import { NextResponse } from "next/server";

import { getToken } from "@/lib/admin-auth";
import { proxyMultipart } from "@/lib/proxy-upload";

/**
 * One chunk of a release zip, on its way to the install's `updates/` folder.
 *
 * A release is a hundred megabytes and shared hosting accepts a couple per
 * request, so the Updates screen slices the file (`chunk_bytes`, from the
 * API) and posts the pieces in order here; `proxyMultipart` streams each one
 * through untouched, with the same Origin check and session every console
 * upload has. A route handler rather than a Server Action because the screen
 * shows progress per chunk.
 */
export async function POST(request: Request) {
  const token = await getToken();

  if (!token) {
    return NextResponse.json({ message: "Your session has expired. Reload the page and sign in again." }, { status: 401 });
  }

  return proxyMultipart(request, "/admin/system/updates/upload", { token });
}
