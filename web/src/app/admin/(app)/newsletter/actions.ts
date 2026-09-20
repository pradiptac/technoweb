"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addNewsletterSuppression, analyseNewsletterImport,
  cancelCampaign,
  decideCampaignTest,
  createNewsletterCampaign, createNewsletterGroup, createNewsletterSubscriber,
  deleteNewsletterCampaign, deleteNewsletterGroup, deleteNewsletterSubscriber,
  duplicateNewsletterCampaign, getCampaignAudience, getCampaignHealth,
  getNewsletterQueue, getNewsletterTemplate,
  liftNewsletterSuppression, pasteNewsletterAddresses, previewNewsletterBlocks,
  resendNewsletterCampaign,
  runNewsletterImport,
  sendCampaign,
  sendCampaignTest, unsubscribeSubscriber, updateNewsletterCampaign, verifySubscriber,
  updateNewsletterGroup,
  addSequenceStep, cancelSequenceEnrolment, createNewsletterSequence, deleteNewsletterSequence,
  deleteSequenceStep, enrolInSequence, reorderSequenceSteps, updateNewsletterSequence, updateSequenceStep,
} from "@/lib/admin";
import type {
  NewsletterAudience, NewsletterHealth, NewsletterImportAnalysis, NewsletterTemplate,
  QueueHealth,
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

/**
 * Ask Hunter about one address now.
 *
 * A refusal comes back as a message rather than a throw: "the month's
 * allowance is used up" is something the person pressing the button needs to
 * read on the row, and a failure changes no status, so the button stays.
 */
export async function verifySubscriberAction(id: number): Promise<Result> {
  try {
    const s = await verifySubscriber(id);
    revalidatePath("/admin/newsletter/subscribers");
    revalidatePath("/admin/newsletter/verification");
    revalidatePath("/admin/newsletter");

    return { ok: `Hunter says: ${s.verification_label.toLowerCase()}${s.verification_result ? ` (${s.verification_result})` : ""}.` };
  } catch (error) {
    return refusal(error, "That address could not be checked.");
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

/**
 * Whether anything will actually deliver a send.
 *
 * Returns null on a failure rather than throwing, like the two above: the send
 * screen must not break because a status panel could not be read, and the
 * panel says nothing at all rather than guessing.
 */
export async function queueStatusAction(): Promise<QueueHealth | null> {
  try {
    return await getNewsletterQueue();
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

/** End a subject test now: by the numbers, or with a named line. */
export async function decideCampaignAction(id: number, winner?: "a" | "b"): Promise<Result> {
  try {
    await decideCampaignTest(id, winner);
    revalidatePath(`/admin/newsletter/campaigns/${id}`);

    return { ok: "Decided." };
  } catch (error) {
    return refusal(error, "That test could not be decided.");
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

/**
 * Resend a sent campaign to whoever did not open it.
 *
 * The API answers with the new campaign, already sending, and the screen
 * moves to *its* report — the figures on the original do not change, and a
 * confirmation left on the original's screen would be a toast about a
 * different campaign. The redirect stays outside the `try`, as every
 * redirecting action here does, or the catch swallows it.
 */
export async function resendCampaignAction(_prev: Result, form: FormData): Promise<Result> {
  const id = Number(form.get("id") ?? 0);
  let copyId: number;

  try {
    const copy = await resendNewsletterCampaign(id, String(form.get("subject") ?? "").trim());
    copyId = copy.id;
    revalidatePath(`/admin/newsletter/campaigns/${id}/report`);
    revalidatePath(`/admin/newsletter/campaigns/${id}`);
    revalidatePath("/admin/newsletter/campaigns");
  } catch (error) {
    return refusal(error, "That campaign could not be resent.");
  }

  redirect(`/admin/newsletter/campaigns/${copyId}/report?done=campaign-resent`);
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

/**
 * Adding a pasted list.
 *
 * Reports the suppressed and invalid counts rather than folding them into
 * "added" — the refused ones are the interesting ones, and a tally that only
 * says how many worked hides the fact that the list is not what somebody
 * thinks it is.
 */
export async function pasteAddressesAction(_prev: Result, form: FormData): Promise<Result> {
  const text = String(form.get("text") ?? "").trim();

  if (text === "") return { error: "Paste some addresses first." };

  try {
    const tally = await pasteNewsletterAddresses(
      text,
      form.getAll("group_ids").map(Number).filter(Boolean),
    );

    revalidatePath("/admin/newsletter/subscribers");

    const parts = [`${tally.added} added`];
    if (tally.already) parts.push(`${tally.already} already on the list`);
    if (tally.updated) parts.push(`${tally.updated} updated`);
    if (tally.suppressed) parts.push(`${tally.suppressed} skipped as unsubscribed`);
    if (tally.invalid) {
      const names = tally.rejected.filter((r) => r.value).slice(0, 5).map((r) => r.value).join(", ");
      parts.push(`${tally.invalid} not a valid address${names ? ` (${names})` : ""}`);
    }

    return { ok: parts.join(", ") + "." };
  } catch (error) {
    return refusal(error, "Those addresses could not be added.");
  }
}

// -------------------------------------------------------------- sequences

/**
 * A sequence's own screens revalidate the sequence and the list. The step
 * campaigns' editor is the campaign editor, which revalidates itself.
 */
function revalidateSequence(id: number): void {
  revalidatePath(`/admin/newsletter/sequences/${id}`);
  revalidatePath("/admin/newsletter/sequences");
}

export async function createSequenceAction(_prev: Result, form: FormData): Promise<Result> {
  let id: number;

  // The redirect stays outside the try — see `createCampaignAction`.
  try {
    const sequence = await createNewsletterSequence({
      name: String(form.get("name") ?? ""),
      newsletter_group_id: Number(form.get("newsletter_group_id") ?? 0) || null,
      from_name: String(form.get("from_name") ?? "") || null,
      from_email: String(form.get("from_email") ?? "") || null,
      reply_to: String(form.get("reply_to") ?? "") || null,
      // Born paused: a sequence with no steps yet has nothing to run, and
      // switching it on is the moment the steps are checked.
      status: "paused",
    });
    id = sequence.id;
  } catch (error) {
    return refusal(error, "That sequence could not be created.");
  }

  redirect(`/admin/newsletter/sequences/${id}?tab=steps`);
}

export async function saveSequenceAction(_prev: Result, form: FormData): Promise<Result> {
  const id = Number(form.get("id") ?? 0);

  try {
    await updateNewsletterSequence(id, {
      name: String(form.get("name") ?? ""),
      newsletter_group_id: Number(form.get("newsletter_group_id") ?? 0) || null,
      from_name: String(form.get("from_name") ?? "") || null,
      from_email: String(form.get("from_email") ?? "") || null,
      reply_to: String(form.get("reply_to") ?? "") || null,
    });
    revalidateSequence(id);

    return { ok: "Saved." };
  } catch (error) {
    return refusal(error, "That sequence could not be saved.");
  }
}

/**
 * Switch a sequence on or off. Switching on runs the blocking checks on
 * every step, and the refusal names the step — that sentence is the one
 * worth showing, so it comes back rather than a generic one.
 */
export async function setSequenceStatusAction(id: number, status: "active" | "paused"): Promise<Result> {
  try {
    await updateNewsletterSequence(id, { status });
    revalidateSequence(id);

    return { ok: status === "active" ? "The sequence is running." : "The sequence is paused. Nobody receives a step until it is switched on again." };
  } catch (error) {
    return refusal(error, "The sequence's status could not be changed.");
  }
}

export async function deleteSequenceAction(id: number): Promise<Result> {
  try {
    await deleteNewsletterSequence(id);
  } catch (error) {
    // Refused while anybody is still enrolled, and the API says how many.
    return refusal(error, "That sequence could not be deleted.");
  }

  redirect("/admin/newsletter/sequences?done=sequence-deleted");
}

export async function addStepAction(_prev: Result, form: FormData): Promise<Result> {
  const id = Number(form.get("id") ?? 0);

  try {
    const sequence = await addSequenceStep(id, {
      subject: String(form.get("subject") ?? ""),
      delay_days: Number(form.get("delay_days") ?? 0),
      newsletter_template_id: Number(form.get("template_id") ?? 0) || null,
    });
    revalidateSequence(id);

    const step = sequence.steps?.[sequence.steps.length - 1];

    return { ok: step ? `Step ${step.position} added. Open it to write the message.` : "Step added." };
  } catch (error) {
    return refusal(error, "That step could not be added.");
  }
}

export async function reorderStepsAction(id: number, ids: number[]): Promise<Result> {
  try {
    await reorderSequenceSteps(id, ids);
    revalidateSequence(id);

    return { ok: "Reordered." };
  } catch (error) {
    return refusal(error, "The steps could not be reordered.");
  }
}

export async function setStepDelayAction(id: number, stepId: number, delayDays: number): Promise<Result> {
  try {
    await updateSequenceStep(id, stepId, delayDays);
    revalidateSequence(id);

    return { ok: "Saved." };
  } catch (error) {
    return refusal(error, "That delay could not be saved.");
  }
}

export async function removeStepAction(id: number, stepId: number): Promise<Result> {
  try {
    await deleteSequenceStep(id, stepId);
    revalidateSequence(id);

    return { ok: "Step removed. The rest were renumbered." };
  } catch (error) {
    return refusal(error, "That step could not be removed.");
  }
}

/**
 * Enrol by hand. The tally comes back as a sentence that names the refused
 * ones — the interesting ones, as with every import here.
 */
export async function enrolAction(_prev: Result, form: FormData): Promise<Result> {
  const id = Number(form.get("id") ?? 0);
  const groupId = Number(form.get("group_id") ?? 0) || null;
  const emails = String(form.get("emails") ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);

  if (!groupId && emails.length === 0) {
    return { error: "Choose a group or paste some addresses." };
  }

  try {
    const tally = await enrolInSequence(id, { group_id: groupId, emails });
    revalidateSequence(id);

    const parts = [`${tally.enrolled} enrolled`];
    if (tally.already_enrolled) parts.push(`${tally.already_enrolled} already in it`);
    if (tally.not_active) parts.push(`${tally.not_active} not active`);
    if (tally.suppressed) parts.push(`${tally.suppressed} on the do-not-mail list`);
    if (tally.unknown) parts.push(`${tally.unknown} not on the subscriber list`);
    if (tally.no_steps) parts.push("nobody, because the sequence has no steps");

    return { ok: parts.join(", ") + "." };
  } catch (error) {
    return refusal(error, "Nobody could be enrolled.");
  }
}

export async function cancelEnrolmentAction(id: number, enrolmentId: number): Promise<Result> {
  try {
    await cancelSequenceEnrolment(id, enrolmentId);
    revalidateSequence(id);

    return { ok: "Cancelled. Nothing more goes to them from this sequence." };
  } catch (error) {
    return refusal(error, "That enrolment could not be cancelled.");
  }
}
