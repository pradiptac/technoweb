"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api";
import {
  authorizeLinkedIn, chooseLinkedInOrganization, completeLinkedIn, disconnectLinkedIn, getLinkedInOrganizations,
} from "@/lib/admin";
import type { LinkedInOrganization } from "@/types/social-posts";
import { revalidateSettingsScreens } from "./revalidate";

export type SocialResult = { ok?: string; error?: string; organizations?: LinkedInOrganization[] };

/** The API's own sentence where it gave one — LinkedIn's words name the thing to fix. */
function reason(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return "Only an administrator can change the LinkedIn connection.";

    const first = Object.values(error.errors ?? {})[0]?.[0];

    return first || error.message || fallback;
  }

  return fallback;
}

/**
 * Start the consent. The origin is read from the request, so the callback
 * given to LinkedIn is on the host the administrator is actually using — the
 * shape every other connection here has. `redirect()` is outside the `try`:
 * it works by throwing.
 */
export async function connectLinkedInAction(): Promise<SocialResult> {
  const host = (await headers()).get("host");
  const proto = (await headers()).get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");

  let url: string;
  try {
    url = await authorizeLinkedIn(`${proto}://${host}`);
  } catch (error) {
    return { error: reason(error, "We could not start the connection. Save the client ID and secret first.") };
  }

  redirect(url);
}

export async function finishLinkedInConnection(code: string, state: string): Promise<SocialResult> {
  try {
    const { account } = await completeLinkedIn(code, state);
    revalidateSettingsScreens();

    return { ok: account ?? "LinkedIn" };
  } catch (error) {
    return { error: reason(error, "That connection did not complete. Start again from Settings → Social accounts.") };
  }
}

export async function disconnectLinkedInAction(): Promise<SocialResult> {
  try {
    await disconnectLinkedIn();
    revalidateSettingsScreens();

    return { ok: "Disconnected. Approving a LinkedIn post copies the text and opens LinkedIn for you to post by hand until it is connected again." };
  } catch (error) {
    return { error: reason(error, "We could not disconnect LinkedIn.") };
  }
}

/** The pages the connected person administers, in LinkedIn's words when it refuses. */
export async function listLinkedInOrganizationsAction(): Promise<SocialResult> {
  try {
    return { organizations: await getLinkedInOrganizations() };
  } catch (error) {
    return { error: reason(error, "We could not list the LinkedIn pages. You can type the page's ID instead.") };
  }
}

export async function chooseLinkedInOrganizationAction(id: string, name: string | null): Promise<SocialResult> {
  try {
    await chooseLinkedInOrganization(id, name);
    revalidateSettingsScreens();

    return { ok: name ? `Posts go to ${name}.` : `Posts go to the page with ID ${id}.` };
  } catch (error) {
    return { error: reason(error, "That page ID was not accepted. It is the number in the page's admin address.") };
  }
}
