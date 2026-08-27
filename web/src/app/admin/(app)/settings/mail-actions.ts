"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ApiError } from "@/lib/api";
import {
  authorizeMailbox, completeMailConnection, disconnectMailbox, sendTestMail,
} from "@/lib/admin";

export type MailActionState = { error?: string; ok?: string };

/** An ApiError carries the API's own sentence; anything else does not. */
function reason(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return "Only an administrator can change outgoing mail.";
    if (error.message) return error.message;
  }

  return fallback;
}

/**
 * Start the Google consent flow.
 *
 * Called imperatively from a click rather than through a <form action>: this
 * panel lives inside the settings form, and HTML forbids nesting one form in
 * another — the browser silently drops the inner one, so the button would have
 * submitted the settings payload instead.
 *
 * A redirect out of a Server Action rather than returning the URL for the
 * client to follow: `redirect()` throws, so there is no window in which the
 * page has the consent URL and has not gone to it, and no state left behind if
 * the browser is closed mid-way.
 *
 * The origin comes from the request headers, so the callback registered with
 * Google is the host the administrator is actually on — localhost in
 * development, the real domain in production, with nothing to configure twice.
 */
export async function connectMailboxAction(transport: string): Promise<MailActionState> {
  const host = (await headers()).get("host");
  const proto = (await headers()).get("x-forwarded-proto")
    ?? (host?.startsWith("localhost") ? "http" : "https");

  let url: string;
  try {
    url = await authorizeMailbox(transport, `${proto}://${host}`);
  } catch (error) {
    return { error: reason(error, "We could not start the connection. Save the client ID and secret first.") };
  }

  redirect(url);
}

export async function finishMailConnection(code: string, state: string): Promise<MailActionState> {
  let account: string;
  try {
    account = await completeMailConnection(code, state);
  } catch (error) {
    return { error: reason(error, "That connection did not complete. Start again from Settings.") };
  }

  revalidatePath("/admin/settings");
  updateTag("settings");

  return { ok: account };
}

export async function disconnectMailboxAction(): Promise<MailActionState> {
  try {
    await disconnectMailbox();
  } catch (error) {
    return { error: reason(error, "We could not disconnect that mailbox.") };
  }

  revalidatePath("/admin/settings");
  updateTag("settings");

  return { ok: "Disconnected." };
}

/**
 * Send one real message and say what happened.
 *
 * The failure text is the mail server's own, passed through rather than
 * replaced with something friendlier: "Connection could not be established
 * with host smtp.example.com:587" tells whoever configured this exactly what
 * to fix, and "We could not send a test message" tells them nothing at all.
 */
export async function testMailAction(): Promise<MailActionState> {
  try {
    const result = await sendTestMail();

    return { ok: `Sent to ${result.sent_to} via ${result.transport}. If it does not arrive, check the spam folder before changing anything.` };
  } catch (error) {
    return { error: reason(error, "The message could not be sent.") };
  }
}
