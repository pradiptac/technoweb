"use server";

import { revalidatePath } from "next/cache";

export type SubmitState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

/**
 * Submits an editor-built form.
 *
 * A Server Action rather than a fetch from the browser, for the same reason
 * every other write here is: the API base URL and any future credential stay
 * on the server, and the visitor's browser never talks to Laravel directly.
 *
 * The whole FormData is forwarded, honeypot included — the API decides what is
 * a field and what is not, from the stored definition. Filtering here would
 * put a second, weaker copy of that decision in the client bundle.
 */
export async function submitFormAction(slug: string, _prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const payload: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") payload[key] = value;
  }

  const base = process.env.API_BASE_URL ?? "http://localhost:8000";

  try {
    const res = await fetch(`${base}/api/v1/forms/${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const body = await res.json().catch(() => ({}));

    if (res.status === 422) {
      return { error: body.message ?? "Please check the highlighted fields.", fieldErrors: body.errors };
    }
    if (res.status === 429) {
      return { error: "Too many messages from this connection. Wait a minute and try again." };
    }
    if (!res.ok) {
      return { error: "We could not send that. Try again, or call us instead." };
    }

    revalidatePath("/");
    return { ok: true, message: body.message ?? "Thank you — we will be in touch shortly." };
  } catch {
    // The API being unreachable must read as "try again", not as a stack
    // trace or a silent no-op.
    return { error: "We could not reach us just then. Try again, or call the number above." };
  }
}
