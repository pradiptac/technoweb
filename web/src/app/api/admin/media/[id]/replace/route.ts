import { NextResponse } from "next/server";

import { getToken } from "@/lib/admin-auth";
import { proxyMultipart } from "@/lib/proxy-upload";

/** Overwrite a library file in place, watched — see `../../upload/route.ts`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken();

  if (!token) {
    return NextResponse.json({ message: "Your session has expired. Reload the page and sign in again." }, { status: 401 });
  }

  const { id } = await params;

  if (!/^\d+$/.test(id)) return NextResponse.json({ message: "That file could not be identified." }, { status: 400 });

  return proxyMultipart(request, `/admin/media/${id}/replace`, { token });
}
