"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";

import { ApiError } from "@/lib/api";
import { createClient, deleteClient, updateClient, type ClientPayload } from "@/lib/admin";

export type ClientState = { error?: string; fieldErrors?: Record<string, string[]> };

function payload(formData: FormData): ClientPayload {
  const str = (k: string) => String(formData.get(k) ?? "").trim();

  return {
    name: str("name"),
    logo_path: str("logo_path") || null,
    website_url: str("website_url") || null,
    industry_id: Number(str("industry_id")) || null,
    note: str("note") || null,
    is_featured: formData.get("is_featured") === "on",
    status: str("status"),
    sort_order: Number(str("sort_order")) || 0,
  };
}

function fail(error: unknown): ClientState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: error.message, fieldErrors: error.errors };

    return { error: error.message };
  }

  return { error: "We could not save that. Try again." };
}

/** `/clients` by tag; the homepage strip and About by path. */
function published(): void {
  updateTag("clients");
  revalidatePath("/");
  revalidatePath("/about");
}

export async function createClientAction(_prev: ClientState, formData: FormData): Promise<ClientState> {
  let id: number;

  try {
    const row = await createClient(payload(formData));
    id = row.id;
    published();
  } catch (error) {
    return fail(error);
  }

  redirect(`/admin/clients/${id}?done=created`);
}

export async function updateClientAction(id: number, _prev: ClientState, formData: FormData): Promise<ClientState> {
  try {
    await updateClient(id, payload(formData));
    published();
  } catch (error) {
    return fail(error);
  }

  redirect(`/admin/clients/${id}?done=saved`);
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));

  if (Number.isFinite(id) && id > 0) {
    await deleteClient(id).catch(() => null);
    published();
  }

  redirect("/admin/clients?done=client-deleted");
}
