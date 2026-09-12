import { NextResponse } from "next/server";

import { getToken } from "@/lib/admin-auth";
import { proxyMultipart } from "@/lib/proxy-upload";

/**
 * A staff reply with attachments — the console's counterpart of the portal
 * handler. `is_internal` travels in the same form and is honoured by the API
 * exactly as it is through the Server Action; nothing about the internal-note
 * guard lives on this side of the wire.
 */
export async function POST(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const token = await getToken();

  if (!token) {
    return NextResponse.json({ message: "Your session has expired. Sign in again." }, { status: 401 });
  }

  const { reference } = await params;

  return proxyMultipart(request, `/admin/tickets/${encodeURIComponent(reference)}/reply`, { token });
}
