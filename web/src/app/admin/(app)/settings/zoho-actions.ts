"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api";
import { authorizeZohoBooks, completeZohoBooks, disconnectZohoBooks, testZohoBooks } from "@/lib/admin";
import { revalidateSettingsScreens } from "./revalidate";

export type ZohoResult = { ok?: string; error?: string };

/** The API's own sentence where it gave one — Zoho's words name the thing to fix. */
function reason(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return "Only an administrator can change the Zoho Books connection.";

    const first = Object.values(error.errors ?? {})[0]?.[0];

    return first || error.message || fallback;
  }

  return fallback;
}

/**
 * Start the consent. The origin is read from the request, so the callback
 * given to Zoho is on the host the administrator is actually using — the
 * shape every other connection here has. `redirect()` is outside the `try`:
 * it works by throwing.
 */
export async function connectZohoBooksAction(): Promise<ZohoResult> {
  const host = (await headers()).get("host");
  const proto = (await headers()).get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");

  let url: string;
  try {
    url = await authorizeZohoBooks(`${proto}://${host}`);
  } catch (error) {
    return { error: reason(error, "We could not start the connection. Save the client ID and secret first.") };
  }

  redirect(url);
}

export async function finishZohoBooksConnection(code: string, state: string): Promise<ZohoResult> {
  try {
    const account = await completeZohoBooks(code, state);
    revalidateSettingsScreens();

    return { ok: account };
  } catch (error) {
    return { error: reason(error, "That connection did not complete. Start again from Store → Settings.") };
  }
}

export async function disconnectZohoBooksAction(): Promise<ZohoResult> {
  try {
    await disconnectZohoBooks();
    revalidateSettingsScreens();

    return { ok: "Disconnected. No invoices are made in Zoho Books until an account is connected again." };
  } catch (error) {
    return { error: reason(error, "We could not disconnect Zoho Books.") };
  }
}

export async function testZohoBooksAction(): Promise<ZohoResult> {
  try {
    const result = await testZohoBooks();
    revalidateSettingsScreens();

    return {
      ok: result.ready
        ? `Zoho Books answered, with ${result.taxes} tax${result.taxes === 1 ? "" : "es"} to choose from. Invoices will be made.`
        : `Zoho Books answered. Still to do before invoices are made: ${result.missing.join(" ") || "switch it on."}`,
    };
  } catch (error) {
    revalidateSettingsScreens();

    return { error: reason(error, "Zoho Books did not answer.") };
  }
}
