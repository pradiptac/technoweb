"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { testHunterKey } from "@/lib/admin";

export type IntegrationActionState = { error?: string; ok?: string };

/** An ApiError carries the API's own sentence; anything else does not. */
function reason(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return "Only an administrator can test an API key.";
    if (error.message) return error.message;
  }

  return fallback;
}

/**
 * Ask Hunter for the account behind the saved key.
 *
 * Free on the plan, and it answers the question worth asking before the
 * nightly run spends anything: what is left. A success also clears the
 * verification banner the last failure wrote, so the Verification screen is
 * re-read.
 */
export async function testHunterAction(): Promise<IntegrationActionState> {
  try {
    const a = await testHunterKey();
    revalidatePath("/admin/newsletter/verification");

    return {
      ok: `${a.plan_name ? `${a.plan_name} plan — ` : ""}${a.used} of ${a.used + a.available} verifications used this period, ${a.available} left`
        + `${a.reset_date ? `, resets ${a.reset_date}` : ""}.`,
    };
  } catch (error) {
    return { error: reason(error, "The key could not be tested.") };
  }
}
