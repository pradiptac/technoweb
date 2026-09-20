"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ApiError } from "@/lib/api";
import {
  authorizeNewsletterMailbox, completeNewsletterConnection, disconnectNewsletterMailbox,
  startNewsletterMailboxScan, getNewsletterImport, discardNewsletterImport,
} from "@/lib/admin";
import type { NewsletterMailboxImport } from "@/types/api";

export type MailboxActionState = { error?: string; ok?: string };

const PAGE = "/admin/newsletter/subscribers/import/mailbox";

/** The API's own sentence when it gave one — the first field error, else the message. */
function reason(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return "Only a campaign manager can import subscribers.";
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : null;
    return first ?? error.message ?? fallback;
  }

  return fallback;
}

/**
 * Start the consent for the mailbox a scan reads.
 *
 * The shape every consent action here has: a click rather than a nested
 * <form action>, a redirect out of the action so no consent URL is left
 * lying in state, the origin read from the request so the callback that is
 * registered is the host the person is actually on.
 */
export async function connectNewsletterMailboxAction(provider: string): Promise<MailboxActionState> {
  const host = (await headers()).get("host");
  const proto = (await headers()).get("x-forwarded-proto")
    ?? (host?.startsWith("localhost") ? "http" : "https");

  let url: string;
  try {
    url = await authorizeNewsletterMailbox(provider, `${proto}://${host}`);
  } catch (error) {
    return { error: reason(error, "We could not start the connection.") };
  }

  redirect(url);
}

export async function finishNewsletterConnection(code: string, state: string): Promise<MailboxActionState> {
  let result: { account: string; provider: string };
  try {
    result = await completeNewsletterConnection(code, state);
  } catch (error) {
    return { error: reason(error, "That connection did not complete. Start again from the import screen.") };
  }

  revalidatePath(PAGE);

  return { ok: result.account };
}

export async function disconnectNewsletterMailboxAction(): Promise<MailboxActionState> {
  try {
    await disconnectNewsletterMailbox();
  } catch (error) {
    return { error: reason(error, "We could not let go of that mailbox.") };
  }

  revalidatePath(PAGE);

  return { ok: "Disconnected." };
}

export async function startScanAction(payload: Record<string, unknown>): Promise<{ scan?: NewsletterMailboxImport; error?: string }> {
  try {
    const scan = await startNewsletterMailboxScan(payload);

    revalidatePath(PAGE);

    return { scan };
  } catch (error) {
    return { error: reason(error, "The scan could not be started.") };
  }
}

/** What the screen polls. Null when the request failed — nothing is a better answer than a guess. */
export async function pollImportAction(id: number): Promise<NewsletterMailboxImport | null> {
  try {
    return await getNewsletterImport(id);
  } catch {
    return null;
  }
}

export async function discardImportAction(id: number): Promise<MailboxActionState> {
  try {
    await discardNewsletterImport(id);
  } catch (error) {
    return { error: reason(error, "That scan could not be discarded.") };
  }

  revalidatePath(PAGE);

  return { ok: "Discarded." };
}
