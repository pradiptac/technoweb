"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addCustomersToNewsletter, addNewsletterSuppression, analyseNewsletterImport,
  cancelCampaign,
  createNewsletterCampaign, createNewsletterGroup, createNewsletterSubscriber,
  deleteNewsletterCampaign, deleteNewsletterGroup, deleteNewsletterSubscriber,
  duplicateNewsletterCampaign, getCampaignAudience, getCampaignHealth,
  getNewsletterTemplate,
  liftNewsletterSuppression, previewNewsletterBlocks, runNewsletterImport,
  sendCampaign,
  sendCampaignTest, unsubscribeSubscriber, updateNewsletterCampaign,
  updateNewsletterGroup,
} from "@/lib/admin";
import type {
  NewsletterAudience, NewsletterHealth, NewsletterImportAnalysis, NewsletterTemplate,
} from "@/types/api";
import { ApiError } from "@/lib/api";

/**
 * Every call the newsletter console makes.
 *
 * `lib/admin.ts` is `server-only`, so a client component cannot reach it —
 * the same rule `lib/settings.ts` documents for `telHref`. Its *types* cross
 * the boundary; its functions do not.
 */

type Result = { ok?: string; error?: string };

/** The message an API refusal actually carries, rather than a generic one. */
function refusal(error: unknown, fallback: string): Result {
  if (error instanceof ApiError) {
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : null;
    return { error: first ?? error.message };
  }

  return { error: fallback };
}

// ------------------------------------------------------------- subscribers

export async function addSubscriberAction(_prev: Result, form: FormData): Promise<Result> {
  try {
    await createNewsletterSubscriber({
      email: String(form.get("email") ?? ""),
      first_name: String(form.get("first_name") ?? "") || null,
      last_name: String(form.get("last_name") ?? "") || null,
      company: String(form.get("company") ?? "") || null,
      group_ids: form.getAll("group_ids").map(Number).filter(Boolean),
    });

    revalidatePath("/admin/newsletter/subscribers");

    return { ok: "Added." };
  } catch (error) {
    return refusal(error, "That address could not be added.");
  }
}

export async function removeSubscriberAction(id: number): Promise<void> {
  await deleteNewsletterSubscriber(id);
  revalidatePath("/admin/newsletter/subscribers");
}

export async function unsubscribeAction(id: number): Promise<void> {
  await unsubscribeSubscriber(id, "Unsubscribed by staff on request.");
  revalidatePath("/admin/newsletter/subscribers");
}

export async function addCustomersAction(_prev: Result, form: FormData): Promise<Result> {
  try {
    const tally = await addCustomersToNewsletter({
      scope: "all",
      group_ids: form.getAll("group_ids").map(Number).filter(Boolean),
    });

    revalidatePath("/admin/newsletter/subscribers");

    /*
      The suppressed count is reported rather than hidden. "Added 412" when 38
      were refused reads as a complete success, and the 38 are the interesting
      ones — they are people who asked not to be contacted, and somebody should
      know the list is not what they think it is.
    */
    return {
      ok: `${tally.added} added, ${tally.updated} updated, ${tally.already} already on the list`
        + (tally.suppressed ? `, ${tally.suppressed} skipped as unsubscribed` : ""),
    };
  } catch (error) {
    return refusal(error, "Those customers could not be added.");
  }
}

// ------------------------------------------------------------------ groups

export async function saveGroupAction(_prev: Result, form: FormData): Promise<Result> {
  const id = Number(form.get("id") ?? 0);

  try {
    const payload = {
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? "") || null,
    };

    if (id) await updateNewsletterGroup(id, payload);
    else await createNewsletterGroup(payload);

    revalidatePath("/admin/newsletter/groups");

    return { ok: id ? "Saved." : "Group created." };
  } catch (error) {
    return refusal(error, "That group could not be saved.");
  }
}

export async function deleteGroupAction(id: number): Promise<void> {
  await deleteNewsletterGroup(id);
  revalidatePath("/admin/newsletter/groups");
}

// --------------------------------------------------------------- campaigns

export async function createCampaignAction(_prev: Result, form: FormData): Promise<Result> {
  let id: number;

  /*
    The redirect is **outside** the try, deliberately.

    `redirect()` works by throwing, and the error it throws does not have
    `message === "NEXT_REDIRECT"` — it carries a `digest` that starts with it.
    So a `catch` that tries to recognise and re-throw the redirect swallows it
    instead, and the campaign is created while the browser stays on the form
    reporting a failure. Measured: the row existed, the screen said it had not
    been created. Keeping the throw out of the try removes the question.
  */
  try {
    const campaign = await createNewsletterCampaign({
      name: String(form.get("name") ?? ""),
      subject: String(form.get("subject") ?? ""),
      newsletter_template_id: Number(form.get("template_id") ?? 0) || null,
      blocks: JSON.parse(String(form.get("blocks") ?? "[]")),
    });

    id = campaign.id;
  } catch (error) {
    return refusal(error, "That campaign could not be created.");
  }

  redirect(`/admin/newsletter/campaigns/${id}`);
}

export async function saveCampaignAction(id: number, payload: Record<string, unknown>): Promise<Result> {
  try {
    await updateNewsletterCampaign(id, payload);
    revalidatePath(`/admin/newsletter/campaigns/${id}`);

    return { ok: "Saved." };
  } catch (error) {
    return refusal(error, "That could not be saved.");
  }
}

export async function previewAction(blocks: unknown[], preheader?: string | null): Promise<string> {
  try {
    return await previewNewsletterBlocks(blocks, preheader);
  } catch {
    return "<p style=\"font-family:sans-serif;padding:24px;color:#8a5c10\">The preview could not be rendered.</p>";
  }
}

export async function audienceAction(id: number): Promise<NewsletterAudience | null> {
  try {
    return await getCampaignAudience(id);
  } catch {
    return null;
  }
}

export async function healthAction(id: number): Promise<NewsletterHealth | null> {
  try {
    return await getCampaignHealth(id);
  } catch {
    return null;
  }
}

export async function testAction(id: number, email?: string): Promise<Result> {
  try {
    const res = await sendCampaignTest(id, email || undefined);

    return { ok: res.message };
  } catch (error) {
    /*
      The one action allowed to report a mail failure verbatim — the same
      licence the settings screen's test button has. Pressing it asks "does
      mail work", so a friendlier message would answer the opposite question.
    */
    return refusal(error, "The test could not be sent.");
  }
}

export async function sendCampaignAction(id: number, scheduledAt?: string | null): Promise<Result> {
  try {
    const res = await sendCampaign(id, scheduledAt);
    revalidatePath(`/admin/newsletter/campaigns/${id}`);
    revalidatePath("/admin/newsletter/campaigns");

    return { ok: res.message };
  } catch (error) {
    return refusal(error, "That campaign could not be sent.");
  }
}

export async function cancelCampaignAction(id: number): Promise<void> {
  await cancelCampaign(id);
  revalidatePath(`/admin/newsletter/campaigns/${id}`);
}

export async function duplicateCampaignAction(id: number): Promise<void> {
  const copy = await duplicateNewsletterCampaign(id);
  redirect(`/admin/newsletter/campaigns/${copy.id}`);
}

export async function deleteCampaignAction(id: number): Promise<void> {
  await deleteNewsletterCampaign(id);
  redirect("/admin/newsletter/campaigns?done=campaign-deleted");
}

// ------------------------------------------------------------ suppressions

export async function suppressAction(_prev: Result, form: FormData): Promise<Result> {
  try {
    await addNewsletterSuppression(
      String(form.get("email") ?? ""),
      String(form.get("note") ?? "") || undefined,
    );

    revalidatePath("/admin/newsletter/unsubscribes");

    return { ok: "Added to the do-not-mail list." };
  } catch (error) {
    return refusal(error, "That address could not be added.");
  }
}

export async function liftSuppressionAction(id: number): Promise<Result> {
  try {
    await liftNewsletterSuppression(id);
    revalidatePath("/admin/newsletter/unsubscribes");

    return { ok: "Removed." };
  } catch (error) {
    // A refusal here is the interesting case: staff may lift a bounce and may
    // not lift somebody's own decision, and the API says which this was.
    return refusal(error, "That suppression could not be removed.");
  }
}

// ------------------------------------------------------------- CSV import

/**
 * Step one: read the file and report what *would* happen. Writes nothing.
 *
 * The file is held on the API's private disk between this and the commit, so
 * the browser posts it once rather than again for the real run — a fifty
 * thousand row spreadsheet is not something to upload twice to change one
 * column mapping.
 */
export async function analyseImportAction(form: FormData): Promise<
  { analysis?: NewsletterImportAnalysis; error?: string }
> {
  try {
    return { analysis: await analyseNewsletterImport(form) };
  } catch (error) {
    const r = refusal(error, "That file could not be read.");
    return { error: r.error };
  }
}

/** Step two: commit the analysed file. */
export async function runImportAction(payload: Record<string, unknown>): Promise<
  { tally?: Record<string, number>; error?: string }
> {
  try {
    const tally = await runNewsletterImport(payload);

    revalidatePath("/admin/newsletter/subscribers");

    return { tally };
  } catch (error) {
    const r = refusal(error, "That import could not be completed.");
    return { error: r.error };
  }
}

/**
 * One template, with its blocks.
 *
 * The gallery index omits them deliberately — ten templates at six kilobytes
 * each is sixty to draw a grid of names — so the preview and the "start from
 * this" copy both fetch the full record when one is actually chosen.
 */
export async function templateAction(id: number): Promise<NewsletterTemplate | null> {
  try {
    return await getNewsletterTemplate(id);
  } catch {
    return null;
  }
}
