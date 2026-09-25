"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  cancelMessageBroadcast, createMessageBroadcast, createMessageTemplate, deleteMessageBroadcast, deleteMessageTemplate,
  optOutMessageContact, saveMessageAutomations, sendMessageBroadcast, submitMessageTemplate, syncMessageTemplates,
  testMessageTemplate, updateMessageBroadcast, updateMessageTemplate,
  type MessageBroadcastPayload, type MessageTemplatePayload,
} from "@/lib/admin";
import { str } from "@/lib/admin-form";
import type { MessageButton } from "@/types/api";

export type MessagingFormState = { error?: string; ok?: string; fieldErrors?: Record<string, string[]> };

function toState(error: unknown, fallback: string): MessagingFormState {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Messaging is for campaign and store managers." };
    if (error.status === 422) {
      const send = error.errors?.send;
      if (send?.length) return { error: send.join(" "), fieldErrors: error.errors };
      return { error: error.message && !error.errors ? error.message : "Check the highlighted fields.", fieldErrors: error.errors };
    }
    if (error.message) return { error: error.message };
  }
  return { error: fallback };
}

/* -------------------------------------------------------------- templates */

function templateFrom(formData: FormData, creating: boolean): MessageTemplatePayload {
  let buttons: MessageButton[] = [];
  try {
    buttons = JSON.parse(String(formData.get("buttons") ?? "[]"));
  } catch {
    buttons = [];
  }

  return {
    ...(creating ? { channel: str(formData, "channel") ?? "" } : {}),
    key: str(formData, "key") ?? "",
    name: str(formData, "name") ?? "",
    body: String(formData.get("body") ?? ""),
    header_text: str(formData, "header_text"),
    media_path: str(formData, "media_path"),
    buttons: buttons.filter((b) => b.text.trim() !== ""),
    push_title: str(formData, "push_title"),
    push_link: str(formData, "push_link"),
    category: str(formData, "category"),
    language: str(formData, "language"),
    provider_template_name: str(formData, "provider_template_name"),
    provider_template_id: str(formData, "provider_template_id"),
  };
}

export async function saveMessageTemplateAction(_p: MessagingFormState, formData: FormData): Promise<MessagingFormState> {
  const id = Number(formData.get("id")) || null;

  let saved;
  try {
    saved = id
      ? await updateMessageTemplate(id, templateFrom(formData, false))
      : await createMessageTemplate(templateFrom(formData, true));
  } catch (error) {
    return toState(error, "We could not save the template. Try again shortly.");
  }

  revalidatePath("/admin/messaging/templates");
  redirect(`/admin/messaging/templates/${saved.id}?done=${id ? "saved" : "created"}`);
}

export async function deleteMessageTemplateAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  try {
    await deleteMessageTemplate(id);
  } catch {
    redirect(`/admin/messaging/templates/${id}?done=message-template-not-deleted`);
  }

  revalidatePath("/admin/messaging/templates");
  redirect("/admin/messaging/templates?done=message-template-deleted");
}

/** Submit for WhatsApp approval. A refusal comes back in the provider's words. */
export async function submitMessageTemplateAction(id: number): Promise<MessagingFormState> {
  try {
    await submitMessageTemplate(id);
  } catch (error) {
    return toState(error, "The template could not be submitted.");
  }

  revalidatePath(`/admin/messaging/templates/${id}`);
  redirect(`/admin/messaging/templates/${id}?done=message-template-submitted`);
}

export async function testMessageTemplateAction(id: number, to: string): Promise<MessagingFormState> {
  try {
    const result = await testMessageTemplate(id, to.trim());
    return { ok: `Sent to ${result.sent_to}, filled with sample values.` };
  } catch (error) {
    const state = toState(error, "The test could not be sent.");
    return { error: state.fieldErrors?.to?.[0] ?? state.error };
  }
}

export async function syncMessageTemplatesAction(channel: string): Promise<MessagingFormState> {
  try {
    const result = await syncMessageTemplates(channel);
    revalidatePath("/admin/messaging/templates");
    const unknown = result.unknown.length
      ? ` ${result.unknown.length} at the provider have no template here: ${result.unknown.slice(0, 5).join(", ")}${result.unknown.length > 5 ? "…" : ""}.`
      : "";
    return { ok: `${result.matched} template${result.matched === 1 ? "" : "s"} updated from the provider.${unknown}` };
  } catch (error) {
    return toState(error, "The provider could not be read.");
  }
}

/* ------------------------------------------------------------ automations */

export async function saveAutomationsAction(_p: MessagingFormState, formData: FormData): Promise<MessagingFormState> {
  const cells = formData.getAll("cell").map(String);
  const rows = cells.map((cell) => {
    const [event, channel] = cell.split("|");
    const template = Number(formData.get(`template__${cell}`)) || null;

    return { event, channel, message_template_id: template, is_enabled: formData.get(`enabled__${cell}`) === "1" };
  });

  try {
    await saveMessageAutomations(rows);
  } catch (error) {
    if (error instanceof ApiError && error.status === 422 && error.errors) {
      const first = Object.entries(error.errors)[0];
      const index = Number(first?.[0].split(".")[1]);
      const where = Number.isInteger(index) && rows[index] ? ` (${rows[index].event.replaceAll("_", " ")}, ${rows[index].channel})` : "";
      return { error: `${first?.[1]?.[0] ?? "Check the table."}${where}` };
    }
    return toState(error, "We could not save the automations.");
  }

  revalidatePath("/admin/messaging/automations");
  return { ok: "Automations saved." };
}

/* ------------------------------------------------------------- broadcasts */

function broadcastFrom(formData: FormData): MessageBroadcastPayload {
  return {
    name: str(formData, "name") ?? "",
    channel: str(formData, "channel") ?? "",
    message_template_id: Number(formData.get("message_template_id")) || null,
    audience: str(formData, "audience") ?? "opt_ins",
    newsletter_group_id: Number(formData.get("newsletter_group_id")) || null,
    store_product_id: Number(formData.get("store_product_id")) || null,
  };
}

export async function saveBroadcastAction(_p: MessagingFormState, formData: FormData): Promise<MessagingFormState> {
  const id = Number(formData.get("id")) || null;

  let saved;
  try {
    saved = id ? await updateMessageBroadcast(id, broadcastFrom(formData)) : await createMessageBroadcast(broadcastFrom(formData));
  } catch (error) {
    return toState(error, "We could not save the broadcast.");
  }

  revalidatePath("/admin/messaging/broadcasts");
  redirect(`/admin/messaging/broadcasts/${saved.id}?done=${id ? "saved" : "created"}`);
}

export async function sendBroadcastAction(_p: MessagingFormState, formData: FormData): Promise<MessagingFormState> {
  const id = Number(formData.get("id"));
  const when = str(formData, "scheduled_at");
  // A datetime-local carries no zone; this console is in IST, as the API is.
  const scheduled = when ? `${when}:00+05:30` : undefined;

  let result;
  try {
    result = await sendMessageBroadcast(id, scheduled);
  } catch (error) {
    return toState(error, "The broadcast could not be sent.");
  }

  revalidatePath("/admin/messaging/broadcasts");
  redirect(`/admin/messaging/broadcasts/${id}?done=${result.data.status === "scheduled" ? "broadcast-scheduled" : "broadcast-queued"}`);
}

export async function cancelBroadcastAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  try {
    await cancelMessageBroadcast(id);
  } catch {
    redirect(`/admin/messaging/broadcasts/${id}?done=broadcast-not-deleted`);
  }

  revalidatePath(`/admin/messaging/broadcasts/${id}`);
  redirect(`/admin/messaging/broadcasts/${id}?done=broadcast-cancelled`);
}

export async function deleteBroadcastAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  try {
    await deleteMessageBroadcast(id);
  } catch {
    redirect(`/admin/messaging/broadcasts/${id}?done=broadcast-not-deleted`);
  }

  revalidatePath("/admin/messaging/broadcasts");
  redirect("/admin/messaging/broadcasts?done=broadcast-deleted");
}

/* --------------------------------------------------------------- contacts */

export async function optOutContactAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const back = String(formData.get("back") ?? "/admin/messaging/contacts");
  if (!id) return;

  try {
    await optOutMessageContact(id);
  } catch {
    // Nothing to say beyond the list not changing.
  }

  revalidatePath("/admin/messaging/contacts");
  redirect(`${back.startsWith("/admin/messaging/contacts") ? back : "/admin/messaging/contacts"}${back.includes("?") ? "&" : "?"}done=contact-opted-out`);
}
