"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { testGoogleAnalytics, testHunterKey, testSearchConsole } from "@/lib/admin";

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

export async function testGscAction(): Promise<IntegrationActionState> {
  try {
    const r = await testSearchConsole();
    revalidatePath("/admin/seo");
    revalidatePath("/admin/settings");

    return { ok: `${r.site}: ${r.pages} ${r.pages === 1 ? "page" : "pages"} had impressions in the last ${r.days} days.` };
  } catch (error) {
    return { error: reason(error, "The account could not be tested.") };
  }
}

/**
 * The GA4 mirror of the Search Console test: one real report, and a success
 * clears the banner the last refusal wrote on the overview and the store
 * dashboard, so both are re-read.
 */
export async function testGa4Action(): Promise<IntegrationActionState> {
  try {
    const r = await testGoogleAnalytics();
    revalidatePath("/admin/seo");
    revalidatePath("/admin/store");
    revalidatePath("/admin/settings");

    return { ok: `Property ${r.property}: ${r.pages} ${r.pages === 1 ? "page was" : "pages were"} viewed yesterday.` };
  } catch (error) {
    return { error: reason(error, "The property could not be tested.") };
  }
}
