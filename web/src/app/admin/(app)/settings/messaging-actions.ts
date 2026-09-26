"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { sendMessagingTest } from "@/lib/admin";
import type { MailActionState } from "./mail-actions";

/**
 * Send the fixed test message on one channel and say what happened — the
 * provider's own words on a refusal, passed through, because "Recipient
 * phone number not in allowed list" says what to fix and a friendlier
 * sentence would not.
 */
export async function testMessagingAction(channel: string, to: string): Promise<MailActionState> {
  try {
    const result = await sendMessagingTest(channel, to.trim());
    return { ok: `Sent to ${result.sent_to} through ${result.provider}. If it does not arrive, check the number has WhatsApp or RCS and that it is on the provider's test list.` };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 403) return { error: "Only an administrator can test a channel." };
      const field = error.errors?.to?.[0];
      if (field) return { error: field };
      if (error.message) return { error: error.message };
    }
    return { error: "The test could not be sent." };
  }
}
