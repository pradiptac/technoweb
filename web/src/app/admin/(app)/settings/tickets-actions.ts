"use server";

import { updateTag } from "next/cache";
import { revalidateSettingsScreens } from "./revalidate";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ApiError } from "@/lib/api";
import {
  authorizeInboundMailbox, completeInboundConnection, disconnectInboundMailbox, testInboundMail,
} from "@/lib/admin";
import type { MailActionState } from "./mail-actions";

/** An ApiError carries the API's own sentence; anything else does not. */
function reason(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return "Only an administrator can change the support mailbox.";
    if (error.message) return error.message;
  }

  return fallback;
}

/**
 * Start the consent flow for the mailbox tickets are read from.
 *
 * The same shape as `connectMailboxAction` and for the same reasons: called
 * from a click rather than a nested <form action>, a redirect out of the
 * action so there is no window holding an unused consent URL, and the origin
 * read from the request so the registered callback is the host the
 * administrator is actually on.
 */
export async function connectInboundMailboxAction(provider: string): Promise<MailActionState> {
  const host = (await headers()).get("host");
  const proto = (await headers()).get("x-forwarded-proto")
    ?? (host?.startsWith("localhost") ? "http" : "https");

  let url: string;
  try {
    url = await authorizeInboundMailbox(provider, `${proto}://${host}`);
  } catch (error) {
    return { error: reason(error, "We could not start the connection. Save the client ID and secret first.") };
  }

  redirect(url);
}

export async function finishInboundConnection(code: string, state: string): Promise<MailActionState> {
  let result: { account: string; provider: string };
  try {
    result = await completeInboundConnection(code, state);
  } catch (error) {
    return { error: reason(error, "That connection did not complete. Start again from Settings.") };
  }

  revalidateSettingsScreens();
  updateTag("settings");

  return { ok: result.account };
}

export async function disconnectInboundMailboxAction(): Promise<MailActionState> {
  try {
    await disconnectInboundMailbox();
  } catch (error) {
    return { error: reason(error, "We could not disconnect that mailbox.") };
  }

  revalidateSettingsScreens();
  updateTag("settings");

  return { ok: "Disconnected. Email piping stops until a mailbox is connected again." };
}

/**
 * Connect and count, and say what happened in the server's own words —
 * "[AUTHENTICATIONFAILED] Invalid credentials" tells whoever configured this
 * what to fix. Nothing is flagged, moved or turned into a ticket.
 */
export async function testInboundMailAction(): Promise<MailActionState> {
  try {
    const result = await testInboundMail();

    return {
      ok: `Connected as ${result.account}. ${result.unseen} unread message${result.unseen === 1 ? "" : "s"} in ${result.folder}. Nothing was changed.`,
    };
  } catch (error) {
    return { error: reason(error, "The mailbox could not be read.") };
  }
}
