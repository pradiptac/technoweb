import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/admin-auth";
import { proxyMultipart } from "@/lib/proxy-upload";

/**
 * An edit that arrives with a file (docs/downloads.md).
 *
 * A POST carrying `_method=PATCH`, which the form's `prepare` adds: PHP
 * reads a multipart body on POST only, and Laravel reads the override. The
 * upload replaces the download's private file; the old one is deleted by the
 * API once the new one is saved.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken();

  if (!token) {
    return NextResponse.json({ message: "Your session has expired. Reload the page and sign in again." }, { status: 401 });
  }

  const { id } = await params;

  if (!/^[0-9]{1,10}$/.test(id)) {
    return NextResponse.json({ message: "That download could not be found." }, { status: 404 });
  }

  return proxyMultipart(request, `/admin/downloads/${Number(id)}`, { token });
}
