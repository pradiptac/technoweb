"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api";
import {
  previewMailTemplate,
  resetMailTemplate,
  saveMailTemplate,
  sendMailTemplateTest,
  type MailTemplatePayload,
} from "@/lib/admin";

/*
 * `lib/admin.ts` is `server-only`: its types may cross into a client
 * component and its functions may not, so the editor reaches the API through
 * these rather than importing the getters.
 */

export type TemplateState = {
  ok?: string;
  warn?: string;
  error?: string;
  /** Per field, so a refused address lands under the box it was typed into. */
  fieldErrors?: Record<string, string[]>;
};

/** The first sentence the API actually gave, rather than a generic one. */
function refusal(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;

    return first ?? error.message ?? fallback;
  }

  return fallback;
}

function payload(formData: FormData): MailTemplatePayload {
  const str = (k: string) => String(formData.get(k) ?? "").trim();

  /*
   * A checkbox posts nothing when it is unchecked, so a form that reads
   * `get(k) !== "off"` can never turn one off — `null !== "off"` is true.
   * That is what this read for as long as the "Use this wording" box existed,
   * so the box could be unticked and saved and the wording stayed on. Each
   * checkbox now sits after a hidden input of the same name carrying "0", so
   * the key is always posted and a ticked box adds "1" after it.
   *
   * **`getAll(k).at(-1)`, not `get(k)`.** PHP and Rails take the last value
   * for a repeated field; `FormData.get` returns the *first*, which here is
   * the hidden "0" every time — the first cut of this fix read it and saved
   * both switches off however they were set, and a probe reading the box back
   * agreed with it. The value that was posted is not the value that was meant.
   */
  const flag = (k: string) => formData.getAll(k).at(-1) === "1";

  return {
    subject: str("subject"),
    body_html: str("body_html"),
    // Blank means "derive it", which is a different thing from an empty
    // override — so it is sent as null rather than "".
    body_text: str("body_text") || null,
    is_enabled: flag("is_enabled"),
    sends: flag("sends"),
    cc: str("cc"),
    bcc: str("bcc"),
    from_name: str("from_name") || null,
    from_email: str("from_email") || null,
  };
}

export async function saveTemplateAction(
  key: string,
  _prev: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  let unknown: string[] = [];

  try {
    ({ unknown } = await saveMailTemplate(key, payload(formData)));
  } catch (error) {
    return {
      error: refusal(error, "We could not save that wording."),
      ...(error instanceof ApiError && error.errors ? { fieldErrors: error.errors } : {}),
    };
  }

  revalidatePath("/admin/settings/email-templates");
  revalidatePath(`/admin/settings/email-templates/${key}`);

  /*
   * A warning rather than a refusal, and it survives the save: the copy is
   * stored, and the names that will be stripped at send are named here, where
   * the typo was made rather than in somebody's inbox.
   */
  if (unknown.length > 0) {
    return {
      ok: "Saved.",
      warn: `This message does not offer ${unknown.map((u) => `{{${u}}}`).join(", ")}, so ${
        unknown.length === 1 ? "it will be" : "they will be"
      } removed when the email is sent.`,
    };
  }

  return { ok: "Saved. This wording is in use from the next email." };
}

/**
 * A read-only lookup feeding a live preview, so it **swallows** rather than
 * throwing into a component mid-keystroke — the rule `previewAction` in the
 * newsletter already follows.
 */
export async function previewTemplateAction(
  key: string,
  draft: MailTemplatePayload,
): Promise<{ html: string; subject: string } | null> {
  try {
    const { html, subject } = await previewMailTemplate(key, draft);

    return { html, subject };
  } catch {
    return null;
  }
}

export async function sendTestAction(
  key: string,
  draft: MailTemplatePayload & { email?: string | null },
): Promise<TemplateState> {
  try {
    const to = await sendMailTemplateTest(key, draft);

    return { ok: `Sent to ${to}. It uses sample values, so no customer's details left the building.` };
  } catch (error) {
    // The mail server's own words. "Connection could not be established with
    // host smtp.example.com:587" says what to fix.
    return { error: refusal(error, "The test could not be sent.") };
  }
}

export async function resetTemplateAction(formData: FormData): Promise<void> {
  const key = String(formData.get("key") ?? "");

  if (key) {
    await resetMailTemplate(key).catch(() => null);
    revalidatePath("/admin/settings/email-templates");
    revalidatePath(`/admin/settings/email-templates/${key}`);
  }

  // Outside any try: `redirect()` works by throwing, with a `digest` rather
  // than a recognisable message, so a catch swallows it instead.
  redirect("/admin/settings/email-templates?done=template-reset");
}
