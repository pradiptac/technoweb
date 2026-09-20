"use server";

/**
 * The public newsletter endpoints.
 *
 * Called through Server Actions rather than from the browser so the API origin
 * stays server-side, the same as every other public form here.
 */

const base = () => process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

export async function subscribeAction(
  _prev: { ok?: string; error?: string },
  form: FormData,
): Promise<{ ok?: string; error?: string }> {
  try {
    const response = await fetch(`${base()}/api/v1/newsletter/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email: String(form.get("email") ?? ""),
        first_name: String(form.get("first_name") ?? "") || null,
        // The honeypot, named `website` like every other form on this site so
        // there is one convention rather than two.
        website: String(form.get("website") ?? ""),
      }),
      cache: "no-store",
    });

    const body = await response.json().catch(() => ({}));

    if (response.status === 403) {
      return { error: body.message ?? "Signup is closed at the moment." };
    }

    /*
      Everything else is the success message, including a failure.

      The API answers 202 for a new address, one already subscribed and one
      that has unsubscribed alike — anything that distinguished them would make
      this form a membership oracle. Reporting a network error differently
      would leak nothing, but reporting *anything* per-address would, so the
      form keeps one answer.
    */
    return { ok: body.message ?? "Thank you — please check your inbox." };
  } catch {
    return { error: "We could not reach the server. Please try again." };
  }
}

export async function unsubscribeAction(token: string): Promise<{ ok?: string; error?: string }> {
  try {
    const response = await fetch(`${base()}/api/v1/newsletter/unsubscribe/${token}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { error: body.message ?? "That link is no longer valid." };
    }

    return { ok: body.message ?? "You have been unsubscribed." };
  } catch {
    return { error: "We could not reach the server. Please try again." };
  }
}
