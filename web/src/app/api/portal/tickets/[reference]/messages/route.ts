import { NextResponse } from "next/server";

import { getToken } from "@/lib/auth";
import { proxyMultipart } from "@/lib/proxy-upload";

/** A customer's reply with attachments — see `../../route.ts`. */
export async function POST(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const token = await getToken();

  if (!token) {
    return NextResponse.json({ message: "Your session has expired. Sign in again." }, { status: 401 });
  }

  const { reference } = await params;

  return proxyMultipart(request, `/tickets/${encodeURIComponent(reference)}/messages`, { token });
}
